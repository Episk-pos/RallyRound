require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const Gun = require('gun');
require('gun/sea'); // Load SEA module for user authentication
const path = require('path');

const authRoutes = require('./routes/auth');
const schedulingRoutes = require('./routes/scheduling');
const notificationRoutes = require('./routes/notifications');
const testHelperRoutes = require('./routes/test-helpers');

const app = express();
const PORT = process.env.PORT || 8765;

// Trust proxy for proper cookie handling in development
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:8765',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'rally-round-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Routes
app.use('/auth', authRoutes);
app.use('/scheduling', schedulingRoutes);
app.use('/notifications', notificationRoutes);
app.use('/test', testHelperRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize GunDB
const server = app.listen(PORT, () => {
  console.log(`🚀 RallyRound server running on port ${PORT}`);
  console.log(`📡 GunDB peer available at http://localhost:${PORT}/gun`);
});

// Attach Gun to the server
const gun = Gun({
  web: server,
  file: 'radata',
  radisk: true,
  localStorage: false,
  peers: []
});

// Make gun instance available globally for routes
app.set('gun', gun);

// Initialize the public topics discovery graph
const publicTopics = gun.get('public-topics');
app.set('publicTopics', publicTopics);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

module.exports = { app, gun };
