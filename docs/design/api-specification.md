# Live Speaker System - API Specification

This document defines the HTTP API contract between **RallyRound** and **DiscordStats** for the live speaker management system.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                            DISCORDSTATS                             │
│                                                                     │
│  Provides:                      Consumes:                           │
│  • /auth/discord/*              • RallyRound Session API            │
│  • /auth/validate               • RallyRound Participant API        │
│  • /webhooks/rallyround         • RallyRound Signal API             │
│                                 • RallyRound Agenda API             │
└─────────────────────────────────────────────────────────────────────┘
                              ▲           │
                              │           │
                    Auth      │           │  API Calls
                    Validation│           │  + Webhooks
                              │           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            RALLYROUND                               │
│                                                                     │
│  Provides:                      Consumes:                           │
│  • /api/sessions/*              • DiscordStats /auth/validate       │
│  • /api/sessions/:id/signals    • DiscordStats /auth/user           │
│  • /api/sessions/:id/agenda                                         │
│  • /api/sessions/:id/speaker                                        │
│  Sends:                                                             │
│  • Webhooks to DiscordStats                                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Authentication

### Discord OAuth Flow (DiscordStats)

#### `GET /auth/discord`
Initiates Discord OAuth flow. Redirects to Discord authorization page.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `redirect_uri` | string | No | Where to redirect after auth (default: DiscordStats dashboard) |
| `state` | string | No | Opaque state to prevent CSRF |

**Response:** 302 Redirect to Discord

---

#### `GET /auth/discord/callback`
OAuth callback endpoint. Exchanges code for tokens.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | Authorization code from Discord |
| `state` | string | No | State from initial request |

**Response:** 302 Redirect to `redirect_uri` with token

**Redirect URL Pattern:**
```
{redirect_uri}?token={jwt_token}
```

---

#### `GET /auth/validate`
Validates a token and returns basic user info. Used by RallyRound to verify tokens.

**Headers:**
```
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "valid": true,
  "user": {
    "id": "123456789012345678",
    "username": "alice",
    "discriminator": "1234",
    "avatar": "abc123hash",
    "email": "alice@example.com"
  },
  "expiresAt": 1735200000
}
```

**Invalid Token Response (401):**
```json
{
  "valid": false,
  "error": "Token expired"
}
```

---

#### `GET /auth/user`
Returns full user profile for authenticated user.

**Headers:**
```
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "id": "123456789012345678",
  "username": "alice",
  "discriminator": "1234",
  "avatar": "abc123hash",
  "email": "alice@example.com",
  "guilds": [
    {
      "id": "987654321098765432",
      "name": "My Server",
      "icon": "servericon123",
      "owner": false,
      "permissions": 2147483647
    }
  ]
}
```

---

## Session API (RallyRound)

Base URL: `https://rallyround.example.com/api`

All endpoints require authentication:
```
Authorization: Bearer {discord_token}
```

RallyRound validates tokens against DiscordStats `/auth/validate`.

---

### Sessions

#### `POST /sessions`
Create a new live session.

**Request Body:**
```json
{
  "title": "Weekly Standup",
  "description": "Team sync meeting",
  "guildId": "987654321098765432",
  "voiceChannelId": "111222333444555666",
  "textChannelId": "111222333444555667",
  "topicId": "topic_123456_abc",
  "config": {
    "soundEffectsEnabled": true,
    "autoAdvanceAgenda": false,
    "speakerTimeLimit": 300,
    "allowSelfQueue": true,
    "requireFacilitatorApproval": false
  },
  "webhookUrl": "https://discordstats.example.com/webhooks/rallyround",
  "webhookSecret": "shared_secret_here"
}
```

**Success Response (201):**
```json
{
  "id": "session_1735171200_x7k9m",
  "title": "Weekly Standup",
  "description": "Team sync meeting",
  "guildId": "987654321098765432",
  "voiceChannelId": "111222333444555666",
  "textChannelId": "111222333444555667",
  "status": "active",
  "mode": "unstructured",
  "isRecording": false,
  "facilitatorId": "123456789012345678",
  "speakerId": null,
  "speakerStartedAt": null,
  "config": {
    "soundEffectsEnabled": true,
    "autoAdvanceAgenda": false,
    "speakerTimeLimit": 300,
    "allowSelfQueue": true,
    "requireFacilitatorApproval": false
  },
  "createdAt": 1735171200000,
  "createdBy": "123456789012345678",
  "dashboardUrl": "https://rallyround.example.com/live/session_1735171200_x7k9m"
}
```

**Error Response (400):**
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Title is required",
  "field": "title"
}
```

---

#### `GET /sessions/:id`
Get session state.

**Path Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Session ID |

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `include` | string | `""` | Comma-separated: `participants,queue,agenda` |

**Success Response (200):**
```json
{
  "id": "session_1735171200_x7k9m",
  "title": "Weekly Standup",
  "status": "active",
  "mode": "structured",
  "isRecording": true,
  "facilitatorId": "123456789012345678",
  "speakerId": "234567890123456789",
  "speakerStartedAt": 1735171500000,
  "startedAt": 1735171200000,
  "participants": [
    {
      "discordId": "234567890123456789",
      "discordUsername": "bob",
      "discordAvatar": "avatar123",
      "status": "speaking",
      "signal": null,
      "joinedAt": 1735171200000,
      "speakingTime": 180
    }
  ],
  "queue": [
    {
      "discordId": "345678901234567890",
      "signal": "hand",
      "timestamp": 1735171400000,
      "priority": "normal",
      "acknowledged": false
    }
  ],
  "agenda": {
    "currentItemIndex": 1,
    "items": [
      {
        "id": "item_001",
        "title": "Opening remarks",
        "status": "completed",
        "completedAt": 1735171300000
      },
      {
        "id": "item_002",
        "title": "Budget discussion",
        "status": "active",
        "startedAt": 1735171300000
      }
    ]
  }
}
```

**Not Found (404):**
```json
{
  "error": "NOT_FOUND",
  "message": "Session not found"
}
```

---

#### `PATCH /sessions/:id`
Update session properties.

**Request Body (partial update):**
```json
{
  "mode": "structured",
  "isRecording": true,
  "status": "paused"
}
```

**Allowed Fields:**
| Field | Type | Facilitator Only | Description |
|-------|------|------------------|-------------|
| `mode` | `"unstructured"` \| `"structured"` | Yes | Session mode |
| `isRecording` | boolean | Yes | Recording indicator |
| `status` | `"active"` \| `"paused"` | Yes | Session status |
| `config` | object | Yes | Session configuration |

**Success Response (200):**
```json
{
  "id": "session_1735171200_x7k9m",
  "mode": "structured",
  "isRecording": true,
  "status": "paused",
  "updatedAt": 1735171600000
}
```

**Triggers Webhook:** Yes (if mode or isRecording changed)

---

#### `DELETE /sessions/:id`
End a session.

**Success Response (200):**
```json
{
  "id": "session_1735171200_x7k9m",
  "status": "ended",
  "endedAt": 1735175000000,
  "duration": 3800,
  "stats": {
    "totalParticipants": 12,
    "totalSignals": 45,
    "agendaItemsCompleted": 4
  }
}
```

**Triggers Webhook:** Yes (`session_ended` event)

---

### Participants

#### `POST /sessions/:id/participants`
Add participant to session (called when user joins VC or dashboard).

**Request Body:**
```json
{
  "discordId": "234567890123456789",
  "discordUsername": "bob",
  "discordAvatar": "avatar123",
  "source": "discord"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `discordId` | string | Yes | Discord user ID |
| `discordUsername` | string | Yes | Discord username |
| `discordAvatar` | string | No | Avatar hash |
| `source` | `"discord"` \| `"dashboard"` | Yes | Where they joined from |

**Success Response (201):**
```json
{
  "discordId": "234567890123456789",
  "discordUsername": "bob",
  "status": "ready",
  "joinedAt": 1735171200000
}
```

**Already Exists (200):**
```json
{
  "discordId": "234567890123456789",
  "discordUsername": "bob",
  "status": "ready",
  "joinedAt": 1735171100000,
  "message": "Participant already in session"
}
```

---

#### `DELETE /sessions/:id/participants/:discordId`
Remove participant from session (called when user leaves VC).

**Success Response (200):**
```json
{
  "discordId": "234567890123456789",
  "removed": true,
  "wasInQueue": true,
  "wasSpeaker": false
}
```

---

#### `PATCH /sessions/:id/participants/:discordId`
Update participant status.

**Request Body:**
```json
{
  "status": "away"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"ready"` \| `"away"` | Participant status |

**Success Response (200):**
```json
{
  "discordId": "234567890123456789",
  "status": "away",
  "updatedAt": 1735171600000
}
```

---

### Signals

#### `POST /sessions/:id/signals`
Raise a signal (add to queue if applicable).

**Request Body:**
```json
{
  "discordId": "234567890123456789",
  "signal": "point_of_clarification"
}
```

| Signal | Mode Required | Adds to Queue | Priority |
|--------|---------------|---------------|----------|
| `hand` | Any | Yes | normal |
| `away` | Any | No | - |
| `point_of_order` | Structured | Yes | interrupt |
| `point_of_clarification` | Structured | Yes | high |
| `point_of_information` | Structured | Yes | high |
| `question` | Structured | Yes | normal |
| `agree` | Structured | No | low |
| `disagree` | Structured | No | low |
| `move_to_vote` | Structured | Yes | normal |
| `table` | Structured | Yes | normal |

**Success Response (201):**
```json
{
  "discordId": "234567890123456789",
  "signal": "point_of_clarification",
  "timestamp": 1735171600000,
  "queuePosition": 2,
  "priority": "high"
}
```

**Mode Mismatch Error (400):**
```json
{
  "error": "MODE_MISMATCH",
  "message": "Signal 'point_of_clarification' requires structured mode",
  "currentMode": "unstructured"
}
```

**Triggers Webhook:** Yes (`signal_raised` event)

---

#### `DELETE /sessions/:id/signals/:discordId`
Clear a participant's signal.

**Success Response (200):**
```json
{
  "discordId": "234567890123456789",
  "cleared": true,
  "wasInQueue": true,
  "previousSignal": "hand"
}
```

---

### Speaker

#### `POST /sessions/:id/speaker`
Set the current speaker.

**Request Body:**
```json
{
  "discordId": "234567890123456789"
}
```

**Requires:** Facilitator role

**Success Response (200):**
```json
{
  "speakerId": "234567890123456789",
  "speakerUsername": "bob",
  "speakerStartedAt": 1735171700000,
  "previousSpeakerId": "123456789012345678",
  "previousSpeakerTime": 180
}
```

**Triggers Webhook:** Yes (`speaker_changed` event)

---

#### `POST /sessions/:id/speaker/next`
Advance to next person in queue.

**Requires:** Facilitator role

**Success Response (200):**
```json
{
  "speakerId": "345678901234567890",
  "speakerUsername": "carol",
  "speakerStartedAt": 1735171800000,
  "signal": "hand",
  "previousSpeakerId": "234567890123456789",
  "queueRemaining": 2
}
```

**Empty Queue (200):**
```json
{
  "speakerId": null,
  "message": "Queue is empty",
  "previousSpeakerId": "234567890123456789"
}
```

**Triggers Webhook:** Yes (`speaker_changed` event)

---

#### `DELETE /sessions/:id/speaker`
Clear current speaker (no one has the floor).

**Requires:** Facilitator role

**Success Response (200):**
```json
{
  "speakerId": null,
  "previousSpeakerId": "234567890123456789",
  "previousSpeakerTime": 240
}
```

---

#### `DELETE /sessions/:id/speaker/queue`
Clear the entire speaker queue.

**Requires:** Facilitator role

**Success Response (200):**
```json
{
  "cleared": true,
  "affectedCount": 5,
  "affectedUsers": [
    "234567890123456789",
    "345678901234567890",
    "456789012345678901"
  ]
}
```

---

### Agenda

#### `GET /sessions/:id/agenda`
Get the session agenda.

**Success Response (200):**
```json
{
  "sessionId": "session_1735171200_x7k9m",
  "currentItemIndex": 1,
  "items": [
    {
      "id": "item_001",
      "title": "Opening remarks",
      "description": null,
      "duration": 5,
      "status": "completed",
      "startedAt": 1735171200000,
      "completedAt": 1735171500000,
      "addedBy": "123456789012345678",
      "addedAt": 1735170000000
    },
    {
      "id": "item_002",
      "title": "Budget discussion",
      "description": "Review Q1 budget proposals",
      "duration": 15,
      "status": "active",
      "startedAt": 1735171500000,
      "completedAt": null,
      "addedBy": "123456789012345678",
      "addedAt": 1735170000000
    },
    {
      "id": "item_003",
      "title": "Q&A",
      "description": null,
      "duration": 10,
      "status": "pending",
      "startedAt": null,
      "completedAt": null,
      "addedBy": "234567890123456789",
      "addedAt": 1735171000000
    }
  ]
}
```

---

#### `POST /sessions/:id/agenda`
Add an agenda item.

**Request Body:**
```json
{
  "title": "New Business",
  "description": "Discuss upcoming projects",
  "duration": 10,
  "position": 3
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Item title |
| `description` | string | No | Item description |
| `duration` | number | No | Estimated minutes |
| `position` | number | No | Insert position (appends if omitted) |

**Success Response (201):**
```json
{
  "id": "item_004",
  "title": "New Business",
  "description": "Discuss upcoming projects",
  "duration": 10,
  "status": "pending",
  "addedBy": "234567890123456789",
  "addedAt": 1735171800000,
  "position": 3
}
```

---

#### `PATCH /sessions/:id/agenda/:itemId`
Update an agenda item.

**Request Body:**
```json
{
  "status": "completed"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Update title |
| `description` | string | Update description |
| `duration` | number | Update duration |
| `status` | `"pending"` \| `"active"` \| `"completed"` \| `"skipped"` | Update status |

**Requires:** Facilitator role (for status changes)

**Success Response (200):**
```json
{
  "id": "item_002",
  "status": "completed",
  "completedAt": 1735172000000,
  "updatedAt": 1735172000000
}
```

**Triggers Webhook:** Yes (`agenda_item_completed` or `agenda_item_skipped`)

---

#### `DELETE /sessions/:id/agenda/:itemId`
Remove an agenda item.

**Requires:** Facilitator role

**Success Response (200):**
```json
{
  "id": "item_004",
  "removed": true
}
```

---

#### `POST /sessions/:id/agenda/next`
Advance to the next agenda item.

**Requires:** Facilitator role

**Behavior:**
1. Marks current active item as `completed`
2. Sets next pending item as `active`

**Success Response (200):**
```json
{
  "completedItem": {
    "id": "item_002",
    "title": "Budget discussion",
    "status": "completed"
  },
  "activeItem": {
    "id": "item_003",
    "title": "Q&A",
    "status": "active",
    "startedAt": 1735172100000
  },
  "remainingItems": 1
}
```

**Triggers Webhook:** Yes (`agenda_advanced`)

---

#### `POST /sessions/:id/agenda/reorder`
Reorder agenda items.

**Request Body:**
```json
{
  "itemIds": ["item_003", "item_001", "item_002", "item_004"]
}
```

**Requires:** Facilitator role

**Success Response (200):**
```json
{
  "reordered": true,
  "items": [
    { "id": "item_003", "position": 0 },
    { "id": "item_001", "position": 1 },
    { "id": "item_002", "position": 2 },
    { "id": "item_004", "position": 3 }
  ]
}
```

---

## Webhooks (RallyRound → DiscordStats)

RallyRound sends webhooks to DiscordStats when events occur that require Discord action (sound effects, announcements, etc.).

### Webhook Endpoint (DiscordStats)

```
POST https://discordstats.example.com/webhooks/rallyround
```

### Authentication

Webhooks are signed using HMAC-SHA256:

```
X-RallyRound-Signature: sha256=<hex_signature>
X-RallyRound-Timestamp: 1735172000
```

**Signature Calculation:**
```javascript
const payload = timestamp + '.' + JSON.stringify(body);
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(payload)
  .digest('hex');
```

**Verification (DiscordStats):**
1. Check timestamp is within 5 minutes of current time
2. Compute expected signature
3. Compare with provided signature using timing-safe comparison

---

### Webhook Events

#### `signal_raised`
Sent when a participant raises a signal.

```json
{
  "event": "signal_raised",
  "timestamp": 1735172000000,
  "session": {
    "id": "session_1735171200_x7k9m",
    "guildId": "987654321098765432",
    "voiceChannelId": "111222333444555666",
    "textChannelId": "111222333444555667"
  },
  "data": {
    "discordId": "234567890123456789",
    "discordUsername": "bob",
    "signal": "point_of_order",
    "priority": "interrupt",
    "queuePosition": 1
  }
}
```

**Expected DiscordStats Action:**
- Play appropriate sound effect (e.g., gavel for point_of_order)
- Optionally post reaction/message in text channel

---

#### `speaker_changed`
Sent when the speaker changes.

```json
{
  "event": "speaker_changed",
  "timestamp": 1735172000000,
  "session": {
    "id": "session_1735171200_x7k9m",
    "guildId": "987654321098765432",
    "voiceChannelId": "111222333444555666",
    "textChannelId": "111222333444555667"
  },
  "data": {
    "newSpeaker": {
      "discordId": "345678901234567890",
      "discordUsername": "carol"
    },
    "previousSpeaker": {
      "discordId": "234567890123456789",
      "discordUsername": "bob",
      "duration": 180
    }
  }
}
```

**Expected DiscordStats Action:**
- Play transition sound
- Announce new speaker in text channel

---

#### `mode_changed`
Sent when session mode changes.

```json
{
  "event": "mode_changed",
  "timestamp": 1735172000000,
  "session": {
    "id": "session_1735171200_x7k9m",
    "guildId": "987654321098765432",
    "voiceChannelId": "111222333444555666",
    "textChannelId": "111222333444555667"
  },
  "data": {
    "mode": "structured",
    "previousMode": "unstructured"
  }
}
```

**Expected DiscordStats Action:**
- Announce mode change in text channel
- Optionally play sound

---

#### `recording_changed`
Sent when recording indicator changes.

```json
{
  "event": "recording_changed",
  "timestamp": 1735172000000,
  "session": {
    "id": "session_1735171200_x7k9m",
    "guildId": "987654321098765432",
    "voiceChannelId": "111222333444555666",
    "textChannelId": "111222333444555667"
  },
  "data": {
    "isRecording": true
  }
}
```

**Expected DiscordStats Action:**
- Play "Recording started" or "Recording stopped" audio
- Post warning message in text channel

---

#### `agenda_advanced`
Sent when agenda moves to next item.

```json
{
  "event": "agenda_advanced",
  "timestamp": 1735172000000,
  "session": {
    "id": "session_1735171200_x7k9m",
    "guildId": "987654321098765432",
    "voiceChannelId": "111222333444555666",
    "textChannelId": "111222333444555667"
  },
  "data": {
    "completedItem": {
      "id": "item_002",
      "title": "Budget discussion"
    },
    "activeItem": {
      "id": "item_003",
      "title": "Q&A"
    },
    "remainingItems": 2
  }
}
```

**Expected DiscordStats Action:**
- Play completion sound
- Announce new agenda item in text channel

---

#### `session_ended`
Sent when session ends.

```json
{
  "event": "session_ended",
  "timestamp": 1735175000000,
  "session": {
    "id": "session_1735171200_x7k9m",
    "guildId": "987654321098765432",
    "voiceChannelId": "111222333444555666",
    "textChannelId": "111222333444555667"
  },
  "data": {
    "duration": 3800,
    "stats": {
      "totalParticipants": 12,
      "totalSignals": 45,
      "agendaItemsCompleted": 4
    }
  }
}
```

**Expected DiscordStats Action:**
- Leave voice channel
- Post session summary in text channel
- Clean up session state

---

## Error Responses

All endpoints use consistent error format:

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message",
  "details": {}
}
```

### Standard Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing token |
| `FORBIDDEN` | 403 | User lacks permission (e.g., not facilitator) |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `MODE_MISMATCH` | 400 | Action not allowed in current mode |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limiting

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Session CRUD | 30 requests | 1 minute |
| Signals | 10 requests | 10 seconds |
| Agenda | 20 requests | 1 minute |
| Speaker | 20 requests | 1 minute |

**Rate Limit Headers:**
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1735172010
```

---

## TypeScript Types (Shared)

These types should be published as a shared package or copied to both repos:

```typescript
// Shared types for RallyRound ↔ DiscordStats

// === Session ===
export interface Session {
  id: string;
  title: string;
  description?: string;
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  topicId?: string;
  status: SessionStatus;
  mode: SessionMode;
  isRecording: boolean;
  facilitatorId: string;
  speakerId?: string;
  speakerStartedAt?: number;
  scheduledAt?: number;
  startedAt?: number;
  endedAt?: number;
  config: SessionConfig;
  webhookUrl?: string;
  createdAt: number;
  createdBy: string;
}

export type SessionStatus = 'scheduled' | 'active' | 'paused' | 'ended';
export type SessionMode = 'unstructured' | 'structured';

export interface SessionConfig {
  soundEffectsEnabled: boolean;
  autoAdvanceAgenda: boolean;
  speakerTimeLimit?: number;
  allowSelfQueue: boolean;
  requireFacilitatorApproval: boolean;
}

// === Participant ===
export interface Participant {
  discordId: string;
  discordUsername: string;
  discordAvatar?: string;
  seaPub?: string;
  sessionId: string;
  status: ParticipantStatus;
  signal?: ParticipantSignal;
  signalTimestamp?: number;
  joinedAt: number;
  speakingTime: number;
  signalCount: number;
  lastUpdateSource: 'dashboard' | 'discord';
}

export type ParticipantStatus =
  | 'ready'
  | 'away'
  | 'speaking'
  | 'queued'
  | 'disconnected';

export type ParticipantSignal =
  | 'hand'
  | 'away'
  | 'point_of_order'
  | 'point_of_clarification'
  | 'point_of_information'
  | 'question'
  | 'agree'
  | 'disagree'
  | 'move_to_vote'
  | 'table';

// === Queue ===
export interface SpeakerQueueEntry {
  discordId: string;
  signal: ParticipantSignal;
  timestamp: number;
  priority: QueuePriority;
  acknowledged: boolean;
}

export type QueuePriority = 'interrupt' | 'high' | 'normal' | 'low';

// === Agenda ===
export interface Agenda {
  sessionId: string;
  items: AgendaItem[];
  currentItemIndex: number;
}

export interface AgendaItem {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  status: AgendaItemStatus;
  startedAt?: number;
  completedAt?: number;
  addedBy: string;
  addedAt: number;
}

export type AgendaItemStatus = 'pending' | 'active' | 'completed' | 'skipped';

// === Webhooks ===
export type WebhookEvent =
  | SignalRaisedEvent
  | SpeakerChangedEvent
  | ModeChangedEvent
  | RecordingChangedEvent
  | AgendaAdvancedEvent
  | SessionEndedEvent;

export interface WebhookPayload<T extends WebhookEvent> {
  event: T['event'];
  timestamp: number;
  session: {
    id: string;
    guildId: string;
    voiceChannelId: string;
    textChannelId: string;
  };
  data: T['data'];
}

export interface SignalRaisedEvent {
  event: 'signal_raised';
  data: {
    discordId: string;
    discordUsername: string;
    signal: ParticipantSignal;
    priority: QueuePriority;
    queuePosition?: number;
  };
}

export interface SpeakerChangedEvent {
  event: 'speaker_changed';
  data: {
    newSpeaker?: {
      discordId: string;
      discordUsername: string;
    };
    previousSpeaker?: {
      discordId: string;
      discordUsername: string;
      duration: number;
    };
  };
}

export interface ModeChangedEvent {
  event: 'mode_changed';
  data: {
    mode: SessionMode;
    previousMode: SessionMode;
  };
}

export interface RecordingChangedEvent {
  event: 'recording_changed';
  data: {
    isRecording: boolean;
  };
}

export interface AgendaAdvancedEvent {
  event: 'agenda_advanced';
  data: {
    completedItem?: {
      id: string;
      title: string;
    };
    activeItem?: {
      id: string;
      title: string;
    };
    remainingItems: number;
  };
}

export interface SessionEndedEvent {
  event: 'session_ended';
  data: {
    duration: number;
    stats: {
      totalParticipants: number;
      totalSignals: number;
      agendaItemsCompleted: number;
    };
  };
}
```

---

## Implementation Notes

### For RallyRound:
1. Implement REST API endpoints as specified
2. Validate Discord tokens against DiscordStats on each request
3. Send webhooks on state changes (fire-and-forget with retry)
4. GunDB for real-time sync to web dashboard

### For DiscordStats:
1. Implement OAuth endpoints for Discord authentication
2. Implement token validation endpoint
3. Parse `!rr` commands and call RallyRound API
4. Receive webhooks and trigger sounds/announcements
5. Track VC presence and call RallyRound participant API
