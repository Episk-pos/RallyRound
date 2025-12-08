const express = require('express');
const { google } = require('googleapis');

const router = express.Router();

// OAuth2 client configuration (reused from auth)
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Get current user's calendar availability
 * Uses Google Calendar freeBusy API if user has connected their calendar,
 * otherwise returns empty availability
 */
router.get('/availability', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { timeMin, timeMax } = req.query;

  // Default to next 14 days if not specified
  const startTime = timeMin || new Date().toISOString();
  const endTime = timeMax || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Check if user has calendar tokens
    if (!req.session.user.tokens) {
      return res.json({
        hasCalendar: false,
        busySlots: [],
        timeMin: startTime,
        timeMax: endTime,
      });
    }

    oauth2Client.setCredentials(req.session.user.tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime,
        timeMax: endTime,
        items: [{ id: 'primary' }],
      },
    });

    const busySlots = response.data.calendars?.primary?.busy || [];

    res.json({
      hasCalendar: true,
      busySlots: busySlots.map(slot => ({
        start: new Date(slot.start).getTime(),
        end: new Date(slot.end).getTime(),
      })),
      timeMin: startTime,
      timeMax: endTime,
    });
  } catch (error) {
    console.error('Error fetching calendar availability:', error);

    // If token expired or invalid, indicate no calendar access
    if (error.code === 401 || error.code === 403) {
      return res.json({
        hasCalendar: false,
        busySlots: [],
        timeMin: startTime,
        timeMax: endTime,
        error: 'Calendar access expired. Please re-authenticate.',
      });
    }

    res.status(500).json({ error: 'Failed to fetch calendar availability' });
  }
});

/**
 * Generate suggested time slots for a topic
 * This is a simple implementation - can be enhanced with more sophisticated algorithms
 */
router.post('/generate-slots', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const {
    duration,           // in minutes
    windowDays = 14,    // how far ahead to look
    participantAvailability = [], // array of availability windows per participant
  } = req.body;

  if (!duration) {
    return res.status(400).json({ error: 'Duration is required' });
  }

  try {
    const now = Date.now();
    const windowEnd = now + windowDays * 24 * 60 * 60 * 1000;
    const durationMs = duration * 60 * 1000;

    // Define reasonable meeting hours (9 AM - 6 PM)
    const MEETING_START_HOUR = 9;
    const MEETING_END_HOUR = 18;

    // Generate potential slots (every 30 minutes during meeting hours)
    const potentialSlots = [];
    let currentDay = new Date(now);
    currentDay.setHours(MEETING_START_HOUR, 0, 0, 0);

    // Start from tomorrow if we're past meeting hours today
    if (currentDay.getTime() < now) {
      currentDay.setDate(currentDay.getDate() + 1);
    }

    while (currentDay.getTime() < windowEnd) {
      const dayOfWeek = currentDay.getDay();

      // Skip weekends
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        let slotStart = new Date(currentDay);

        while (slotStart.getHours() < MEETING_END_HOUR - (duration / 60)) {
          const slotEnd = new Date(slotStart.getTime() + durationMs);

          // Calculate score based on how many participants are available
          let availableCount = 0;
          const totalParticipants = participantAvailability.length || 1;

          for (const participant of participantAvailability) {
            const busySlots = participant.busySlots || [];
            const isBusy = busySlots.some(busy =>
              (slotStart.getTime() < busy.end && slotEnd.getTime() > busy.start)
            );
            if (!isBusy) {
              availableCount++;
            }
          }

          const score = totalParticipants > 0
            ? Math.round((availableCount / totalParticipants) * 100)
            : 100;

          potentialSlots.push({
            id: `slot_${slotStart.getTime()}`,
            start: slotStart.getTime(),
            end: slotEnd.getTime(),
            score,
          });

          // Move to next 30-minute slot
          slotStart = new Date(slotStart.getTime() + 30 * 60 * 1000);
        }
      }

      // Move to next day
      currentDay.setDate(currentDay.getDate() + 1);
      currentDay.setHours(MEETING_START_HOUR, 0, 0, 0);
    }

    // Sort by score (descending), then by start time (ascending) for determinism
    potentialSlots.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.start - b.start;
    });

    // Return top 10 slots
    res.json({
      slots: potentialSlots.slice(0, 10),
      generatedAt: Date.now(),
    });
  } catch (error) {
    console.error('Error generating time slots:', error);
    res.status(500).json({ error: 'Failed to generate time slots' });
  }
});

module.exports = router;
