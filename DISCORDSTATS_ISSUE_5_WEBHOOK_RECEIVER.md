# Webhook Receiver for RallyRound Events

## Summary

Implement a webhook endpoint that receives events from RallyRound and triggers appropriate Discord actions (sound effects, chat announcements, etc.).

## Background

When state changes occur in RallyRound (signal raised, speaker changed, agenda advanced, etc.), RallyRound sends webhooks to DiscordStats. The bot must receive these, verify their authenticity, and trigger the appropriate Discord actions.

## Requirements

### Webhook Endpoint

```typescript
// src/routes/webhooks.ts

import express from 'express';
import crypto from 'crypto';

const router = express.Router();

router.post('/webhooks/rallyround', async (req, res) => {
  // 1. Verify signature
  if (!verifyWebhookSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 2. Check timestamp freshness
  if (!isTimestampFresh(req)) {
    return res.status(401).json({ error: 'Stale webhook' });
  }

  // 3. Process event
  try {
    await processWebhookEvent(req.body);
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});
```

### Signature Verification

Verify HMAC-SHA256 signature:

```typescript
// src/webhooks/verify.ts

function verifyWebhookSignature(req: Request): boolean {
  const signature = req.headers['x-rallyround-signature'] as string;
  const timestamp = req.headers['x-rallyround-timestamp'] as string;

  if (!signature || !timestamp) return false;

  // Get session's webhook secret
  const sessionId = req.body.session?.id;
  const secret = getWebhookSecret(sessionId);
  if (!secret) return false;

  // Compute expected signature
  const payload = `${timestamp}.${JSON.stringify(req.body)}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Timing-safe comparison
  const expectedBuffer = Buffer.from(`sha256=${expected}`);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

function isTimestampFresh(req: Request): boolean {
  const timestamp = parseInt(req.headers['x-rallyround-timestamp'] as string);
  const now = Math.floor(Date.now() / 1000);
  const fiveMinutes = 5 * 60;

  return Math.abs(now - timestamp) < fiveMinutes;
}
```

### Event Handlers

#### Signal Raised

```typescript
async function handleSignalRaised(event: SignalRaisedEvent): Promise<void> {
  const { session, data } = event;

  // Play sound effect
  if (shouldPlaySound(session.id, data.signal)) {
    await playSignalSound(session.id, data.signal);
  }

  // Post notification in chat (optional)
  const message = formatSignalNotification(data);
  await sendToChannel(session.textChannelId, message);
}

function formatSignalNotification(data: SignalRaisedData): string {
  const icons = {
    hand: '✋',
    point_of_order: '📋',
    point_of_clarification: '📌',
    point_of_information: 'ℹ️',
    question: '❓',
    agree: '✓',
    disagree: '✗'
  };

  const icon = icons[data.signal] || '🔔';
  return `${icon} **${data.discordUsername}** raised ${data.signal.replace(/_/g, ' ')}`;
}
```

#### Speaker Changed

```typescript
async function handleSpeakerChanged(event: SpeakerChangedEvent): Promise<void> {
  const { session, data } = event;

  // Play transition sound
  await playSound(session.id, 'transition');

  // Announce in chat
  if (data.newSpeaker) {
    await sendToChannel(session.textChannelId,
      `🎤 **${data.newSpeaker.discordUsername}** now has the floor`
    );
  } else {
    await sendToChannel(session.textChannelId,
      `🎤 The floor is now open`
    );
  }
}
```

#### Mode Changed

```typescript
async function handleModeChanged(event: ModeChangedEvent): Promise<void> {
  const { session, data } = event;

  const modeIcons = {
    unstructured: '💬',
    structured: '📋'
  };

  await sendToChannel(session.textChannelId,
    `${modeIcons[data.mode]} Session mode changed to **${data.mode}**`
  );
}
```

#### Recording Changed

```typescript
async function handleRecordingChanged(event: RecordingChangedEvent): Promise<void> {
  const { session, data } = event;

  if (data.isRecording) {
    await playSound(session.id, 'recording-start');
    await sendToChannel(session.textChannelId,
      `🔴 **Recording has started**. This session is being recorded.`
    );
  } else {
    await playSound(session.id, 'recording-stop');
    await sendToChannel(session.textChannelId,
      `⚫ **Recording has stopped**.`
    );
  }
}
```

#### Agenda Advanced

```typescript
async function handleAgendaAdvanced(event: AgendaAdvancedEvent): Promise<void> {
  const { session, data } = event;

  await playSound(session.id, 'complete');

  let message = '';
  if (data.completedItem) {
    message += `☑️ Completed: "${data.completedItem.title}"\n`;
  }
  if (data.activeItem) {
    message += `📍 Now: "${data.activeItem.title}"`;
  }
  if (data.remainingItems === 0) {
    message += `\n✅ All agenda items complete!`;
  }

  await sendToChannel(session.textChannelId, message);
}
```

#### Session Ended

```typescript
async function handleSessionEnded(event: SessionEndedEvent): Promise<void> {
  const { session, data } = event;

  // Post summary
  const duration = formatDuration(data.duration);
  await sendToChannel(session.textChannelId, `
📊 **Session Ended**
Duration: ${duration}
Participants: ${data.stats.totalParticipants}
Signals: ${data.stats.totalSignals}
Agenda items completed: ${data.stats.agendaItemsCompleted}
  `.trim());

  // Leave voice channel
  await leaveSessionVC(session.id);

  // Clean up session registry
  sessionRegistry.clearSession(session.guildId);
}
```

### Event Router

```typescript
// src/webhooks/router.ts

type EventHandler = (event: WebhookEvent) => Promise<void>;

const handlers: Map<string, EventHandler> = new Map([
  ['signal_raised', handleSignalRaised],
  ['speaker_changed', handleSpeakerChanged],
  ['mode_changed', handleModeChanged],
  ['recording_changed', handleRecordingChanged],
  ['agenda_advanced', handleAgendaAdvanced],
  ['session_ended', handleSessionEnded],
]);

async function processWebhookEvent(payload: WebhookPayload): Promise<void> {
  const handler = handlers.get(payload.event);
  if (!handler) {
    console.warn(`Unknown webhook event: ${payload.event}`);
    return;
  }

  await handler(payload);
}
```

### Webhook Secret Management

Store webhook secrets per session:

```typescript
// src/webhooks/secrets.ts

const secrets: Map<string, string> = new Map(); // sessionId -> secret

function storeWebhookSecret(sessionId: string, secret: string): void {
  secrets.set(sessionId, secret);
}

function getWebhookSecret(sessionId: string): string | undefined {
  return secrets.get(sessionId);
}

function clearWebhookSecret(sessionId: string): void {
  secrets.delete(sessionId);
}
```

## Acceptance Criteria

- [ ] `POST /webhooks/rallyround` endpoint implemented
- [ ] HMAC-SHA256 signature verification working
- [ ] Stale timestamp rejection (>5 min)
- [ ] All event types handled
- [ ] Sound effects triggered for appropriate events
- [ ] Chat messages posted for all events
- [ ] Session cleanup on session_ended
- [ ] Unknown events logged but don't error
- [ ] Secrets stored per session

## Testing

1. Send test webhook with valid signature
2. Send webhook with invalid signature (should 401)
3. Send webhook with stale timestamp (should 401)
4. Test each event type triggers correct action
5. Test session_ended cleans up properly

## Related

- Depends on: Sound Effects (Issue #6)
- Depends on: VC Presence (Issue #4) for leaveSessionVC
- Webhooks sent by: RallyRound (see api-specification.md)
