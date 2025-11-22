const express = require('express');
const { google } = require('googleapis');
const keyManagement = require('../services/keyManagement');
const certificateService = require('../services/certificateService');

const router = express.Router();

// OAuth2 client configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Scopes for Google OAuth
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events'
];

// Generate auth URL
router.get('/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

// OAuth callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('No authorization code provided');
  }

  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    const userId = userInfo.data.email;
    const userName = userInfo.data.name;

    // Store session data (WITHOUT any keys - client will generate those)
    req.session.user = {
      id: userId,
      name: userName,
      email: userInfo.data.email,
      picture: userInfo.data.picture,
      tokens: tokens,
      authenticated: true,
      keyRegistered: false // Will be set to true when client registers their public key
    };

    // Redirect to the app - client will generate keys and register them
    res.redirect('/?auth=success');
  } catch (error) {
    console.error('Error during OAuth callback:', error);
    res.status(500).send('Authentication failed');
  }
});

// Get current user info
router.get('/user', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Return user info without tokens
  const { tokens, ...userInfo } = req.session.user;
  res.json(userInfo);
});

// Register a client-generated public key
// Client must send: publicKey (PEM), signature (base64), challenge (the data that was signed)
router.post('/register-key', async (req, res) => {
  if (!req.session.user || !req.session.user.authenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { publicKey, signature, challenge } = req.body;

    if (!publicKey || !signature || !challenge) {
      return res.status(400).json({ error: 'Missing required fields: publicKey, signature, challenge' });
    }

    // Verify that the challenge includes the user's email and a recent timestamp
    let challengeData;
    try {
      challengeData = JSON.parse(challenge);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid challenge format - must be JSON' });
    }

    // Verify challenge contains correct user email
    if (challengeData.email !== req.session.user.email) {
      return res.status(400).json({ error: 'Challenge email does not match authenticated user' });
    }

    // Verify challenge is recent (within 5 minutes)
    const challengeAge = Date.now() - challengeData.timestamp;
    if (challengeAge > 5 * 60 * 1000) {
      return res.status(400).json({ error: 'Challenge expired - must be within 5 minutes' });
    }

    // Verify the signature using the provided public key
    const isValid = keyManagement.verifySignature(challenge, signature, publicKey);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid signature - could not verify with provided public key' });
    }

    // Signature is valid - create a certificate linking this public key to the Google account
    const gun = req.app.get('gun');
    const publicKeys = req.app.get('publicKeys');
    const certificates = req.app.get('certificates');

    const userId = req.session.user.email;
    const userName = req.session.user.name;
    const timestamp = Date.now();
    const keyId = `${userId}:${timestamp}`;

    // Create server-signed certificate
    const certificate = await certificateService.createCertificate(
      userId,
      userName,
      publicKey
    );

    // Store the public key in GunDB
    publicKeys.get(userId).get('keys').get(keyId).put({
      publicKey: publicKey,
      timestamp: timestamp,
      keyId: keyId
    });

    // Store the certificate in GunDB
    certificates.get(userId).get(keyId).put({
      certificate: certificate,
      timestamp: timestamp,
      keyId: keyId
    });

    // Manage rolling window (max 100 keys)
    await keyManagement.enforceKeyLimit(publicKeys, userId, 100);

    // Update session to indicate key is registered
    req.session.user.keyRegistered = true;
    req.session.user.keyId = keyId;
    req.session.user.publicKey = publicKey;

    res.json({
      success: true,
      keyId: keyId,
      certificate: certificate,
      message: 'Public key registered successfully'
    });

  } catch (error) {
    console.error('Error registering public key:', error);
    res.status(500).json({ error: 'Failed to register public key' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Get user's calendar availability
router.get('/calendar/availability', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { timeMin, timeMax } = req.query;

    oauth2Client.setCredentials(req.session.user.tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin || new Date().toISOString(),
        timeMax: timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        items: [{ id: 'primary' }]
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching calendar availability:', error);
    res.status(500).json({ error: 'Failed to fetch calendar availability' });
  }
});

// Create calendar event
router.post('/calendar/event', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { summary, description, start, end, attendees } = req.body;

    oauth2Client.setCredentials(req.session.user.tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const event = {
      summary,
      description,
      start: { dateTime: start },
      end: { dateTime: end },
      attendees: attendees || []
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error creating calendar event:', error);
    res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

module.exports = router;
