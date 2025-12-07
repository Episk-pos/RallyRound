const express = require('express');
const { google } = require('googleapis');
const crypto = require('crypto');

const router = express.Router();

// Generate deterministic SEA seed from Google user ID
function generateSeaSeed(googleUserId) {
  const secret = process.env.SEA_SECRET;
  if (!secret) {
    throw new Error('SEA_SECRET environment variable is required');
  }
  // HMAC-SHA256 to create deterministic seed from user ID
  return crypto.createHmac('sha256', secret).update(googleUserId).digest('hex');
}

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

    // Store session data
    req.session.user = {
      id: userInfo.data.id, // Google's unique user ID (stable)
      email: userInfo.data.email,
      name: userName,
      picture: userInfo.data.picture,
      tokens: tokens,
      authenticated: true
    };

    // Redirect to the app - client will authenticate with SEA
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

// Get SEA seed for deterministic keypair generation
// Client uses this seed to derive the same SEA keypair every time
router.get('/sea-seed', (req, res) => {
  if (!req.session.user || !req.session.user.authenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Generate deterministic seed from Google user ID
    const seed = generateSeaSeed(req.session.user.id);

    res.json({
      seed: seed,
      userId: req.session.user.id,
      email: req.session.user.email
    });
  } catch (error) {
    console.error('Error generating SEA seed:', error);
    res.status(500).json({ error: 'Failed to generate SEA seed' });
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
