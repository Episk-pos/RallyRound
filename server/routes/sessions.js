const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Validate Discord token against DiscordStats
async function validateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);
  const discordStatsUrl = process.env.DISCORDSTATS_URL || 'http://localhost:3001';

  try {
    const response = await fetch(`${discordStatsUrl}/auth/validate`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid token' });
    }

    const data = await response.json();
    if (!data.valid) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: data.error || 'Token validation failed' });
    }

    req.user = data.user;
    req.token = token;
    next();
  } catch (error) {
    console.error('Token validation error:', error);
    // In development, allow bypass if DiscordStats is not available
    if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
      req.user = {
        id: req.headers['x-discord-user-id'] || 'dev-user-123',
        username: req.headers['x-discord-username'] || 'DevUser'
      };
      return next();
    }
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'Auth service unavailable' });
  }
}

// Get session and verify user is facilitator
async function requireFacilitator(req, res, next) {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;

  try {
    const session = await new Promise((resolve) => {
      gun.get('live-sessions').get(sessionId).get('meta').once((data) => {
        resolve(data);
      });
      setTimeout(() => resolve(null), 2000);
    });

    if (!session) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });
    }

    if (session.facilitatorId !== req.user.id) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Only the facilitator can perform this action' });
    }

    req.session = session;
    next();
  } catch (error) {
    console.error('Session lookup error:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to lookup session' });
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateSessionId() {
  return `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function generateItemId() {
  return `item_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

// Signal priority mapping
const SIGNAL_PRIORITIES = {
  point_of_order: 'interrupt',
  point_of_clarification: 'high',
  point_of_information: 'high',
  hand: 'normal',
  question: 'normal',
  move_to_vote: 'normal',
  table: 'normal',
  agree: 'low',
  disagree: 'low',
  away: 'low'
};

// Signals that add to queue
const QUEUE_SIGNALS = [
  'hand', 'point_of_order', 'point_of_clarification',
  'point_of_information', 'question', 'move_to_vote', 'table'
];

// Structured mode only signals
const STRUCTURED_ONLY_SIGNALS = [
  'point_of_order', 'point_of_clarification', 'point_of_information',
  'question', 'agree', 'disagree', 'move_to_vote', 'table'
];

// Send webhook to DiscordStats
async function sendWebhook(session, event, data) {
  if (!session.webhookUrl) return;

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = {
    event,
    timestamp: Date.now(),
    session: {
      id: session.id,
      guildId: session.guildId,
      voiceChannelId: session.voiceChannelId,
      textChannelId: session.textChannelId
    },
    data
  };

  const payloadString = `${timestamp}.${JSON.stringify(payload)}`;
  const signature = crypto
    .createHmac('sha256', session.webhookSecret || '')
    .update(payloadString)
    .digest('hex');

  try {
    await fetch(session.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RallyRound-Signature': `sha256=${signature}`,
        'X-RallyRound-Timestamp': timestamp.toString()
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error('Webhook delivery failed:', error);
    // Don't block on webhook failures
  }
}

// =============================================================================
// SESSION ROUTES
// =============================================================================

// Create session
router.post('/', validateToken, async (req, res) => {
  const gun = req.app.get('gun');
  const { title, description, guildId, voiceChannelId, textChannelId, topicId, config, webhookUrl, webhookSecret } = req.body;

  if (!title || !guildId || !voiceChannelId || !textChannelId) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'title, guildId, voiceChannelId, and textChannelId are required'
    });
  }

  const sessionId = generateSessionId();
  const now = Date.now();

  const session = {
    id: sessionId,
    title,
    description: description || null,
    topicId: topicId || null,
    guildId,
    voiceChannelId,
    textChannelId,
    status: 'active',
    mode: 'unstructured',
    isRecording: false,
    facilitatorId: req.user.id,
    speakerId: null,
    speakerStartedAt: null,
    scheduledAt: null,
    startedAt: now,
    endedAt: null,
    config: {
      soundEffectsEnabled: config?.soundEffectsEnabled ?? true,
      autoAdvanceAgenda: config?.autoAdvanceAgenda ?? false,
      speakerTimeLimit: config?.speakerTimeLimit ?? null,
      allowSelfQueue: config?.allowSelfQueue ?? true,
      requireFacilitatorApproval: config?.requireFacilitatorApproval ?? false
    },
    webhookUrl: webhookUrl || null,
    webhookSecret: webhookSecret || null,
    createdAt: now,
    createdBy: req.user.id
  };

  // Store in GunDB
  gun.get('live-sessions').get(sessionId).get('meta').put(session);

  // Initialize empty agenda
  gun.get('live-sessions').get(sessionId).get('agenda').put({
    sessionId,
    currentItemIndex: -1,
    items: JSON.stringify([])
  });

  // Add facilitator as first participant
  const facilitatorParticipant = {
    discordId: req.user.id,
    discordUsername: req.user.username,
    discordAvatar: req.user.avatar || null,
    sessionId,
    status: 'ready',
    signal: null,
    signalTimestamp: null,
    joinedAt: now,
    speakingTime: 0,
    signalCount: 0,
    lastUpdateSource: 'discord'
  };
  gun.get('live-sessions').get(sessionId).get('participants').get(req.user.id).put(facilitatorParticipant);

  const appUrl = process.env.APP_URL || 'http://localhost:8765';
  res.status(201).json({
    ...session,
    dashboardUrl: `${appUrl}/live/${sessionId}`
  });
});

// Get session
router.get('/:id', validateToken, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const include = (req.query.include || '').split(',').filter(Boolean);

  try {
    const session = await new Promise((resolve) => {
      gun.get('live-sessions').get(sessionId).get('meta').once((data) => {
        resolve(data);
      });
      setTimeout(() => resolve(null), 2000);
    });

    if (!session) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });
    }

    const result = { ...session };

    // Include participants if requested
    if (include.includes('participants')) {
      result.participants = await new Promise((resolve) => {
        const participants = [];
        gun.get('live-sessions').get(sessionId).get('participants').map().once((data) => {
          if (data) participants.push(data);
        });
        setTimeout(() => resolve(participants), 500);
      });
    }

    // Include queue if requested
    if (include.includes('queue')) {
      result.queue = await new Promise((resolve) => {
        const queue = [];
        gun.get('live-sessions').get(sessionId).get('queue').map().once((data) => {
          if (data) queue.push(data);
        });
        setTimeout(() => resolve(queue.sort((a, b) => {
          const priorityOrder = { interrupt: 0, high: 1, normal: 2, low: 3 };
          const aPriority = priorityOrder[a.priority] ?? 2;
          const bPriority = priorityOrder[b.priority] ?? 2;
          if (aPriority !== bPriority) return aPriority - bPriority;
          return a.timestamp - b.timestamp;
        })), 500);
      });
    }

    // Include agenda if requested
    if (include.includes('agenda')) {
      const agendaData = await new Promise((resolve) => {
        gun.get('live-sessions').get(sessionId).get('agenda').once((data) => {
          resolve(data);
        });
        setTimeout(() => resolve(null), 500);
      });
      if (agendaData) {
        result.agenda = {
          sessionId: agendaData.sessionId,
          currentItemIndex: agendaData.currentItemIndex,
          items: JSON.parse(agendaData.items || '[]')
        };
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to get session' });
  }
});

// Update session
router.patch('/:id', validateToken, requireFacilitator, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const session = req.session;
  const { mode, isRecording, status, config } = req.body;

  const updates = {};
  const now = Date.now();

  if (mode !== undefined && ['unstructured', 'structured'].includes(mode)) {
    updates.mode = mode;
  }

  if (isRecording !== undefined) {
    updates.isRecording = !!isRecording;
  }

  if (status !== undefined && ['active', 'paused'].includes(status)) {
    updates.status = status;
  }

  if (config !== undefined) {
    updates.config = { ...session.config, ...config };
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'No valid fields to update' });
  }

  // Apply updates
  gun.get('live-sessions').get(sessionId).get('meta').put(updates);

  const updatedSession = { ...session, ...updates, updatedAt: now };

  // Send webhooks for relevant changes
  if (updates.mode && updates.mode !== session.mode) {
    await sendWebhook(updatedSession, 'mode_changed', {
      mode: updates.mode,
      previousMode: session.mode
    });
  }

  if (updates.isRecording !== undefined && updates.isRecording !== session.isRecording) {
    await sendWebhook(updatedSession, 'recording_changed', {
      isRecording: updates.isRecording
    });
  }

  res.json({ ...updatedSession, updatedAt: now });
});

// End session
router.delete('/:id', validateToken, requireFacilitator, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const session = req.session;
  const now = Date.now();

  // Calculate stats
  const participants = await new Promise((resolve) => {
    const list = [];
    gun.get('live-sessions').get(sessionId).get('participants').map().once((data) => {
      if (data) list.push(data);
    });
    setTimeout(() => resolve(list), 500);
  });

  const agendaData = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('agenda').once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  const items = agendaData ? JSON.parse(agendaData.items || '[]') : [];
  const completedItems = items.filter(i => i.status === 'completed').length;
  const totalSignals = participants.reduce((sum, p) => sum + (p.signalCount || 0), 0);
  const duration = Math.floor((now - session.startedAt) / 1000);

  const stats = {
    totalParticipants: participants.length,
    totalSignals,
    agendaItemsCompleted: completedItems
  };

  // Update session status
  gun.get('live-sessions').get(sessionId).get('meta').put({
    status: 'ended',
    endedAt: now
  });

  // Send webhook
  await sendWebhook(session, 'session_ended', { duration, stats });

  res.json({
    id: sessionId,
    status: 'ended',
    endedAt: now,
    duration,
    stats
  });
});

// =============================================================================
// PARTICIPANT ROUTES
// =============================================================================

// Add participant
router.post('/:id/participants', validateToken, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const { discordId, discordUsername, discordAvatar, source } = req.body;

  if (!discordId || !discordUsername) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'discordId and discordUsername are required'
    });
  }

  // Check if session exists
  const session = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('meta').once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 2000);
  });

  if (!session) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });
  }

  // Check if participant already exists
  const existing = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('participants').get(discordId).once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  if (existing) {
    return res.status(200).json({ ...existing, message: 'Participant already in session' });
  }

  const now = Date.now();
  const participant = {
    discordId,
    discordUsername,
    discordAvatar: discordAvatar || null,
    seaPub: null,
    sessionId,
    status: 'ready',
    signal: null,
    signalTimestamp: null,
    joinedAt: now,
    speakingTime: 0,
    signalCount: 0,
    lastUpdateSource: source || 'discord'
  };

  gun.get('live-sessions').get(sessionId).get('participants').get(discordId).put(participant);

  res.status(201).json(participant);
});

// Remove participant
router.delete('/:id/participants/:discordId', validateToken, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const discordId = req.params.discordId;

  // Check if participant exists
  const participant = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('participants').get(discordId).once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  if (!participant) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Participant not found' });
  }

  // Check if they were in queue
  const queueEntry = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('queue').get(discordId).once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  // Check if they were speaker
  const session = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('meta').once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  const wasSpeaker = session?.speakerId === discordId;

  // Update participant to disconnected
  gun.get('live-sessions').get(sessionId).get('participants').get(discordId).put({
    status: 'disconnected'
  });

  // Remove from queue if present
  if (queueEntry) {
    gun.get('live-sessions').get(sessionId).get('queue').get(discordId).put(null);
  }

  // Clear speaker if they were speaking
  if (wasSpeaker) {
    gun.get('live-sessions').get(sessionId).get('meta').put({
      speakerId: null,
      speakerStartedAt: null
    });
  }

  res.json({
    discordId,
    removed: true,
    wasInQueue: !!queueEntry,
    wasSpeaker
  });
});

// Update participant status
router.patch('/:id/participants/:discordId', validateToken, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const discordId = req.params.discordId;
  const { status } = req.body;

  if (!status || !['ready', 'away'].includes(status)) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'status must be "ready" or "away"'
    });
  }

  const participant = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('participants').get(discordId).once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  if (!participant) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Participant not found' });
  }

  gun.get('live-sessions').get(sessionId).get('participants').get(discordId).put({ status });

  res.json({ discordId, status, updatedAt: Date.now() });
});

// =============================================================================
// SIGNAL ROUTES
// =============================================================================

// Raise signal
router.post('/:id/signals', validateToken, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const { discordId, signal } = req.body;

  if (!discordId || !signal) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'discordId and signal are required'
    });
  }

  // Get session to check mode
  const session = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('meta').once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 2000);
  });

  if (!session) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });
  }

  // Check if signal requires structured mode
  if (STRUCTURED_ONLY_SIGNALS.includes(signal) && session.mode !== 'structured') {
    return res.status(400).json({
      error: 'MODE_MISMATCH',
      message: `Signal '${signal}' requires structured mode`,
      currentMode: session.mode
    });
  }

  // Get participant
  const participant = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('participants').get(discordId).once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  if (!participant) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Participant not found in session' });
  }

  const now = Date.now();
  const priority = SIGNAL_PRIORITIES[signal] || 'normal';

  // Update participant signal
  gun.get('live-sessions').get(sessionId).get('participants').get(discordId).put({
    signal,
    signalTimestamp: now,
    signalCount: (participant.signalCount || 0) + 1,
    lastUpdateSource: 'dashboard'
  });

  let queuePosition = null;

  // Add to queue if applicable
  if (QUEUE_SIGNALS.includes(signal)) {
    const queueEntry = {
      discordId,
      discordUsername: participant.discordUsername,
      signal,
      timestamp: now,
      priority,
      acknowledged: false
    };
    gun.get('live-sessions').get(sessionId).get('queue').get(discordId).put(queueEntry);

    // Calculate queue position
    const queue = await new Promise((resolve) => {
      const entries = [];
      gun.get('live-sessions').get(sessionId).get('queue').map().once((data) => {
        if (data) entries.push(data);
      });
      setTimeout(() => resolve(entries), 300);
    });

    const sorted = queue.sort((a, b) => {
      const priorityOrder = { interrupt: 0, high: 1, normal: 2, low: 3 };
      const aPriority = priorityOrder[a.priority] ?? 2;
      const bPriority = priorityOrder[b.priority] ?? 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.timestamp - b.timestamp;
    });

    queuePosition = sorted.findIndex(e => e.discordId === discordId) + 1;
  }

  // Send webhook
  await sendWebhook(session, 'signal_raised', {
    discordId,
    discordUsername: participant.discordUsername,
    signal,
    priority,
    queuePosition
  });

  res.status(201).json({
    discordId,
    signal,
    timestamp: now,
    queuePosition,
    priority
  });
});

// Clear signal
router.delete('/:id/signals/:discordId', validateToken, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const discordId = req.params.discordId;

  const participant = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('participants').get(discordId).once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  if (!participant) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Participant not found' });
  }

  const previousSignal = participant.signal;

  // Check if in queue
  const queueEntry = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('queue').get(discordId).once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 300);
  });

  // Clear signal
  gun.get('live-sessions').get(sessionId).get('participants').get(discordId).put({
    signal: null,
    signalTimestamp: null
  });

  // Remove from queue
  if (queueEntry) {
    gun.get('live-sessions').get(sessionId).get('queue').get(discordId).put(null);
  }

  res.json({
    discordId,
    cleared: true,
    wasInQueue: !!queueEntry,
    previousSignal
  });
});

// =============================================================================
// SPEAKER ROUTES
// =============================================================================

// Set speaker
router.post('/:id/speaker', validateToken, requireFacilitator, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const session = req.session;
  const { discordId } = req.body;

  if (!discordId) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'discordId is required' });
  }

  // Get participant
  const participant = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('participants').get(discordId).once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  if (!participant) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Participant not found in session' });
  }

  const now = Date.now();
  const previousSpeakerId = session.speakerId;
  let previousSpeakerTime = 0;

  // Update previous speaker's speaking time
  if (previousSpeakerId && session.speakerStartedAt) {
    previousSpeakerTime = Math.floor((now - session.speakerStartedAt) / 1000);
    const prevParticipant = await new Promise((resolve) => {
      gun.get('live-sessions').get(sessionId).get('participants').get(previousSpeakerId).once((data) => {
        resolve(data);
      });
      setTimeout(() => resolve(null), 300);
    });

    if (prevParticipant) {
      gun.get('live-sessions').get(sessionId).get('participants').get(previousSpeakerId).put({
        status: 'ready',
        speakingTime: (prevParticipant.speakingTime || 0) + previousSpeakerTime
      });
    }
  }

  // Set new speaker
  gun.get('live-sessions').get(sessionId).get('meta').put({
    speakerId: discordId,
    speakerStartedAt: now
  });

  // Update participant status
  gun.get('live-sessions').get(sessionId).get('participants').get(discordId).put({
    status: 'speaking',
    signal: null,
    signalTimestamp: null
  });

  // Remove from queue
  gun.get('live-sessions').get(sessionId).get('queue').get(discordId).put(null);

  // Send webhook
  await sendWebhook(session, 'speaker_changed', {
    newSpeaker: { discordId, discordUsername: participant.discordUsername },
    previousSpeaker: previousSpeakerId ? {
      discordId: previousSpeakerId,
      duration: previousSpeakerTime
    } : null
  });

  res.json({
    speakerId: discordId,
    speakerUsername: participant.discordUsername,
    speakerStartedAt: now,
    previousSpeakerId,
    previousSpeakerTime
  });
});

// Next speaker
router.post('/:id/speaker/next', validateToken, requireFacilitator, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const session = req.session;
  const now = Date.now();

  // Get queue
  const queue = await new Promise((resolve) => {
    const entries = [];
    gun.get('live-sessions').get(sessionId).get('queue').map().once((data) => {
      if (data) entries.push(data);
    });
    setTimeout(() => resolve(entries), 500);
  });

  // Sort by priority then timestamp
  const sorted = queue.sort((a, b) => {
    const priorityOrder = { interrupt: 0, high: 1, normal: 2, low: 3 };
    const aPriority = priorityOrder[a.priority] ?? 2;
    const bPriority = priorityOrder[b.priority] ?? 2;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.timestamp - b.timestamp;
  });

  const previousSpeakerId = session.speakerId;
  let previousSpeakerTime = 0;

  // Update previous speaker
  if (previousSpeakerId && session.speakerStartedAt) {
    previousSpeakerTime = Math.floor((now - session.speakerStartedAt) / 1000);
    const prevParticipant = await new Promise((resolve) => {
      gun.get('live-sessions').get(sessionId).get('participants').get(previousSpeakerId).once((data) => {
        resolve(data);
      });
      setTimeout(() => resolve(null), 300);
    });

    if (prevParticipant) {
      gun.get('live-sessions').get(sessionId).get('participants').get(previousSpeakerId).put({
        status: 'ready',
        speakingTime: (prevParticipant.speakingTime || 0) + previousSpeakerTime
      });
    }
  }

  if (sorted.length === 0) {
    // No one in queue
    gun.get('live-sessions').get(sessionId).get('meta').put({
      speakerId: null,
      speakerStartedAt: null
    });

    await sendWebhook(session, 'speaker_changed', {
      newSpeaker: null,
      previousSpeaker: previousSpeakerId ? { discordId: previousSpeakerId, duration: previousSpeakerTime } : null
    });

    return res.json({
      speakerId: null,
      message: 'Queue is empty',
      previousSpeakerId,
      queueRemaining: 0
    });
  }

  const next = sorted[0];

  // Set new speaker
  gun.get('live-sessions').get(sessionId).get('meta').put({
    speakerId: next.discordId,
    speakerStartedAt: now
  });

  // Update participant status
  gun.get('live-sessions').get(sessionId).get('participants').get(next.discordId).put({
    status: 'speaking',
    signal: null,
    signalTimestamp: null
  });

  // Remove from queue
  gun.get('live-sessions').get(sessionId).get('queue').get(next.discordId).put(null);

  // Send webhook
  await sendWebhook(session, 'speaker_changed', {
    newSpeaker: { discordId: next.discordId, discordUsername: next.discordUsername },
    previousSpeaker: previousSpeakerId ? { discordId: previousSpeakerId, duration: previousSpeakerTime } : null
  });

  res.json({
    speakerId: next.discordId,
    speakerUsername: next.discordUsername,
    speakerStartedAt: now,
    signal: next.signal,
    previousSpeakerId,
    queueRemaining: sorted.length - 1
  });
});

// Clear speaker
router.delete('/:id/speaker', validateToken, requireFacilitator, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const session = req.session;
  const now = Date.now();

  const previousSpeakerId = session.speakerId;
  let previousSpeakerTime = 0;

  if (previousSpeakerId && session.speakerStartedAt) {
    previousSpeakerTime = Math.floor((now - session.speakerStartedAt) / 1000);
    const prevParticipant = await new Promise((resolve) => {
      gun.get('live-sessions').get(sessionId).get('participants').get(previousSpeakerId).once((data) => {
        resolve(data);
      });
      setTimeout(() => resolve(null), 300);
    });

    if (prevParticipant) {
      gun.get('live-sessions').get(sessionId).get('participants').get(previousSpeakerId).put({
        status: 'ready',
        speakingTime: (prevParticipant.speakingTime || 0) + previousSpeakerTime
      });
    }
  }

  gun.get('live-sessions').get(sessionId).get('meta').put({
    speakerId: null,
    speakerStartedAt: null
  });

  res.json({ speakerId: null, previousSpeakerId, previousSpeakerTime });
});

// Clear queue
router.delete('/:id/speaker/queue', validateToken, requireFacilitator, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;

  // Get current queue
  const queue = await new Promise((resolve) => {
    const entries = [];
    gun.get('live-sessions').get(sessionId).get('queue').map().once((data) => {
      if (data) entries.push(data);
    });
    setTimeout(() => resolve(entries), 500);
  });

  const affectedUsers = queue.map(e => e.discordId);

  // Clear each entry
  for (const entry of queue) {
    gun.get('live-sessions').get(sessionId).get('queue').get(entry.discordId).put(null);
    // Also clear their signal
    gun.get('live-sessions').get(sessionId).get('participants').get(entry.discordId).put({
      signal: null,
      signalTimestamp: null,
      status: 'ready'
    });
  }

  res.json({
    cleared: true,
    affectedCount: affectedUsers.length,
    affectedUsers
  });
});

// =============================================================================
// AGENDA ROUTES
// =============================================================================

// Get agenda
router.get('/:id/agenda', validateToken, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;

  const agendaData = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('agenda').once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  if (!agendaData) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Agenda not found' });
  }

  res.json({
    sessionId: agendaData.sessionId,
    currentItemIndex: agendaData.currentItemIndex,
    items: JSON.parse(agendaData.items || '[]')
  });
});

// Add agenda item
router.post('/:id/agenda', validateToken, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const { title, description, duration, position } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'title is required' });
  }

  const agendaData = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('agenda').once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  if (!agendaData) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });
  }

  const items = JSON.parse(agendaData.items || '[]');
  const now = Date.now();

  const newItem = {
    id: generateItemId(),
    title,
    description: description || null,
    duration: duration || null,
    status: 'pending',
    startedAt: null,
    completedAt: null,
    addedBy: req.user.id,
    addedAt: now
  };

  // Insert at position or append
  if (position !== undefined && position >= 0 && position < items.length) {
    items.splice(position, 0, newItem);
  } else {
    items.push(newItem);
  }

  gun.get('live-sessions').get(sessionId).get('agenda').put({
    items: JSON.stringify(items)
  });

  res.status(201).json({
    ...newItem,
    position: position !== undefined ? position : items.length - 1
  });
});

// Update agenda item
router.patch('/:id/agenda/:itemId', validateToken, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const itemId = req.params.itemId;
  const { title, description, duration, status } = req.body;

  // Get session for facilitator check on status changes
  const session = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('meta').once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  if (!session) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });
  }

  // Status changes require facilitator
  if (status !== undefined && session.facilitatorId !== req.user.id) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Only facilitator can change item status' });
  }

  const agendaData = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('agenda').once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  const items = JSON.parse(agendaData?.items || '[]');
  const itemIndex = items.findIndex(i => i.id === itemId);

  if (itemIndex === -1) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Agenda item not found' });
  }

  const item = items[itemIndex];
  const now = Date.now();

  if (title !== undefined) item.title = title;
  if (description !== undefined) item.description = description;
  if (duration !== undefined) item.duration = duration;
  if (status !== undefined) {
    const previousStatus = item.status;
    item.status = status;
    if (status === 'active' && !item.startedAt) {
      item.startedAt = now;
    }
    if ((status === 'completed' || status === 'skipped') && !item.completedAt) {
      item.completedAt = now;
    }

    // Update currentItemIndex if setting to active
    if (status === 'active') {
      gun.get('live-sessions').get(sessionId).get('agenda').put({
        currentItemIndex: itemIndex
      });
    }

    // Send webhook for status changes
    if (previousStatus !== status && (status === 'completed' || status === 'skipped')) {
      await sendWebhook(session, 'agenda_advanced', {
        completedItem: { id: item.id, title: item.title },
        activeItem: null,
        remainingItems: items.filter(i => i.status === 'pending').length
      });
    }
  }

  gun.get('live-sessions').get(sessionId).get('agenda').put({
    items: JSON.stringify(items)
  });

  res.json({ ...item, updatedAt: now });
});

// Remove agenda item
router.delete('/:id/agenda/:itemId', validateToken, requireFacilitator, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const itemId = req.params.itemId;

  const agendaData = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('agenda').once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  const items = JSON.parse(agendaData?.items || '[]');
  const itemIndex = items.findIndex(i => i.id === itemId);

  if (itemIndex === -1) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Agenda item not found' });
  }

  items.splice(itemIndex, 1);

  // Adjust currentItemIndex if needed
  let currentIndex = agendaData.currentItemIndex;
  if (itemIndex < currentIndex) {
    currentIndex--;
  } else if (itemIndex === currentIndex) {
    currentIndex = -1;
  }

  gun.get('live-sessions').get(sessionId).get('agenda').put({
    items: JSON.stringify(items),
    currentItemIndex: currentIndex
  });

  res.json({ id: itemId, removed: true });
});

// Advance agenda
router.post('/:id/agenda/next', validateToken, requireFacilitator, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const session = req.session;
  const now = Date.now();

  const agendaData = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('agenda').once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  const items = JSON.parse(agendaData?.items || '[]');
  const currentIndex = agendaData?.currentItemIndex ?? -1;

  let completedItem = null;
  let activeItem = null;

  // Complete current item
  if (currentIndex >= 0 && currentIndex < items.length) {
    items[currentIndex].status = 'completed';
    items[currentIndex].completedAt = now;
    completedItem = { id: items[currentIndex].id, title: items[currentIndex].title };
  }

  // Find next pending item
  const nextIndex = items.findIndex((item, idx) => idx > currentIndex && item.status === 'pending');

  if (nextIndex !== -1) {
    items[nextIndex].status = 'active';
    items[nextIndex].startedAt = now;
    activeItem = { id: items[nextIndex].id, title: items[nextIndex].title };
  }

  gun.get('live-sessions').get(sessionId).get('agenda').put({
    items: JSON.stringify(items),
    currentItemIndex: nextIndex
  });

  const remainingItems = items.filter(i => i.status === 'pending').length;

  // Send webhook
  await sendWebhook(session, 'agenda_advanced', {
    completedItem,
    activeItem,
    remainingItems
  });

  res.json({
    completedItem,
    activeItem,
    remainingItems
  });
});

// Reorder agenda
router.post('/:id/agenda/reorder', validateToken, requireFacilitator, async (req, res) => {
  const gun = req.app.get('gun');
  const sessionId = req.params.id;
  const { itemIds } = req.body;

  if (!Array.isArray(itemIds)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'itemIds must be an array' });
  }

  const agendaData = await new Promise((resolve) => {
    gun.get('live-sessions').get(sessionId).get('agenda').once((data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 500);
  });

  const items = JSON.parse(agendaData?.items || '[]');
  const itemMap = new Map(items.map(item => [item.id, item]));

  // Reorder based on itemIds
  const reordered = [];
  for (const id of itemIds) {
    if (itemMap.has(id)) {
      reordered.push(itemMap.get(id));
      itemMap.delete(id);
    }
  }

  // Append any items not in itemIds (shouldn't happen but be safe)
  for (const item of itemMap.values()) {
    reordered.push(item);
  }

  // Update currentItemIndex based on active item's new position
  const activeIndex = reordered.findIndex(i => i.status === 'active');

  gun.get('live-sessions').get(sessionId).get('agenda').put({
    items: JSON.stringify(reordered),
    currentItemIndex: activeIndex
  });

  res.json({
    reordered: true,
    items: reordered.map((item, index) => ({ id: item.id, position: index }))
  });
});

module.exports = router;
