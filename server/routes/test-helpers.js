/**
 * Test helper routes for E2E testing
 * ONLY available when TEST_MODE=true
 *
 * These endpoints allow direct manipulation of GunDB data for testing
 * multi-user scenarios without relying on real-time sync.
 */
const express = require('express');
const crypto = require('crypto');

const router = express.Router();

// Middleware to ensure TEST_MODE is enabled
router.use((req, res, next) => {
  if (process.env.TEST_MODE !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});

/**
 * Generate a deterministic SEA public key for a test user
 * This mimics what the client would generate
 */
function generateTestPub(userId) {
  // Use the same SEA_SECRET as the real auth flow
  const secret = process.env.SEA_SECRET || 'test-secret';
  const seed = crypto.createHmac('sha256', secret).update(userId).digest('hex');
  // For testing, we use a predictable "pub" derived from the seed
  // In real usage, this would be from SEA.pair() but for test mocking we just need consistency
  return `~${seed.substring(0, 44)}`;
}

/**
 * POST /test/topic
 * Create a topic directly in GunDB (bypassing client SEA auth)
 *
 * For test purposes, we store full topic data in a test-topics graph
 * since we can't write to user spaces without SEA authentication.
 */
router.post('/topic', (req, res) => {
  const gun = req.app.get('gun');
  const { userId, title, description, presenter, presenterEmail, minParticipants = 2 } = req.body;

  if (!userId || !title) {
    return res.status(400).json({ error: 'userId and title are required' });
  }

  const presenterPub = generateTestPub(userId);
  const id = `topic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const topic = {
    id,
    title,
    description: description || 'Test topic description',
    presenter: presenter || 'Test Presenter',
    presenterEmail: presenterEmail || 'test@example.com',
    presenterPub,
    minParticipants,
    duration: 60,
    type: 'presentation',
    stage: 1,
    createdAt: Date.now(),
  };

  // Write full topic to public discovery graph
  // Include all topic fields so client can read full data
  const publicRef = {
    id,
    title: topic.title,
    description: topic.description,
    presenter: topic.presenter,
    presenterEmail: topic.presenterEmail,
    presenterPub,
    minParticipants,
    duration: topic.duration,
    type: topic.type,
    stage: 1,
    interestCount: 0,
    createdAt: topic.createdAt,
  };

  gun.get('public-topics').get(id).put(publicRef);

  // Also store in test-topics for full data access
  // The client's useTopics hook will need to be aware of this for tests
  gun.get('test-topics').get(id).put(topic);

  res.json({ success: true, topic, presenterPub });
});

/**
 * POST /test/interest
 * Express interest in a topic (bypassing client SEA auth)
 */
router.post('/interest', (req, res) => {
  const gun = req.app.get('gun');
  const { topicId, userId, userName, userEmail } = req.body;

  if (!topicId || !userId) {
    return res.status(400).json({ error: 'topicId and userId are required' });
  }

  const userPub = generateTestPub(userId);

  const interest = {
    name: userName || 'Test User',
    email: userEmail || 'test@example.com',
    pub: userPub,
    timestamp: Date.now(),
  };

  // Write interest to public graph
  gun.get('topic-interests').get(topicId).get(userPub).put(interest);

  res.json({ success: true, interest, userPub });
});

/**
 * DELETE /test/interest
 * Remove interest from a topic
 */
router.delete('/interest', (req, res) => {
  const gun = req.app.get('gun');
  const { topicId, userId } = req.body;

  if (!topicId || !userId) {
    return res.status(400).json({ error: 'topicId and userId are required' });
  }

  const userPub = generateTestPub(userId);

  // Remove interest by setting to null
  gun.get('topic-interests').get(topicId).get(userPub).put(null);

  res.json({ success: true, userPub });
});

/**
 * POST /test/topic/stage
 * Update a topic's stage directly
 */
router.post('/topic/stage', (req, res) => {
  const gun = req.app.get('gun');
  const { topicId, stage, presenterPub } = req.body;

  if (!topicId || stage === undefined) {
    return res.status(400).json({ error: 'topicId and stage are required' });
  }

  // Update in public graph
  gun.get('public-topics').get(topicId).get('stage').put(stage);

  // If presenterPub provided, also update in user space
  if (presenterPub) {
    gun.user(presenterPub).get('topics').get(topicId).get('stage').put(stage);
  }

  res.json({ success: true, topicId, stage });
});

/**
 * GET /test/topic/:id
 * Get a topic's current state from Gun
 */
router.get('/topic/:id', async (req, res) => {
  const gun = req.app.get('gun');
  const { id } = req.params;

  // Get from public graph
  gun.get('public-topics').get(id).once((data) => {
    if (!data) {
      return res.status(404).json({ error: 'Topic not found' });
    }
    res.json(data);
  });
});

/**
 * GET /test/interests/:topicId
 * Get all interests for a topic
 */
router.get('/interests/:topicId', (req, res) => {
  const gun = req.app.get('gun');
  const { topicId } = req.params;

  const interests = [];

  gun.get('topic-interests').get(topicId).map().once((data, key) => {
    if (data && key) {
      interests.push({ ...data, key });
    }
  });

  // Give Gun a moment to collect data
  setTimeout(() => {
    res.json({ topicId, interests, count: interests.length });
  }, 100);
});

/**
 * DELETE /test/cleanup
 * Clean up all test data (for test isolation)
 */
router.delete('/cleanup', (req, res) => {
  const gun = req.app.get('gun');

  // Clear public topics (set each key to null)
  gun.get('public-topics').map().once((data, key) => {
    if (key && key.startsWith('topic_')) {
      gun.get('public-topics').get(key).put(null);
    }
  });

  // Clear topic interests
  gun.get('topic-interests').map().once((data, key) => {
    if (key && key.startsWith('topic_')) {
      gun.get('topic-interests').get(key).put(null);
    }
  });

  // Give Gun time to process
  setTimeout(() => {
    res.json({ success: true, message: 'Test data cleaned up' });
  }, 200);
});

module.exports = router;
