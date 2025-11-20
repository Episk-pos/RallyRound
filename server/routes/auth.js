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

    // Generate or retrieve user's key pair
    const gun = req.app.get('gun');
    const publicKeys = req.app.get('publicKeys');
    const certificates = req.app.get('certificates');

    // Generate new key pair for this session
    const keyPair = await keyManagement.generateKeyPair();

    // Create certificate linking the key to the Google account
    const certificate = await certificateService.createCertificate(
      userId,
      userName,
      keyPair.publicKey
    );

    // Store the certificate and public key in GunDB
    const timestamp = Date.now();
    const keyId = `${userId}:${timestamp}`;

    // Add new key
    publicKeys.get(userId).get('keys').get(keyId).put({
      publicKey: keyPair.publicKey,
      timestamp: timestamp,
      keyId: keyId
    });

    certificates.get(userId).get(keyId).put({
      certificate: certificate,
      timestamp: timestamp,
      keyId: keyId
    });

    // Manage rolling window (max 100 keys)
    await keyManagement.enforceKeyLimit(publicKeys, userId, 100);

    // Store session data
    req.session.user = {
      id: userId,
      name: userName,
      email: userInfo.data.email,
      picture: userInfo.data.picture,
      keyId: keyId,
      privateKey: keyPair.privateKey, // Stored only in session
      publicKey: keyPair.publicKey,
      tokens: tokens
    };

    // Redirect to the app
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

  // Return user info without private key
  const { privateKey, tokens, ...userInfo } = req.session.user;
  res.json(userInfo);
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
