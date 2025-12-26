# RallyRound API Client

## Summary

Implement a TypeScript API client for communicating with RallyRound's session management API. This client will be used by the bot command handlers to create/update sessions, manage participants, handle signals, and control the speaker queue.

## Background

When users issue `!rr` commands in Discord, the bot needs to translate these into REST API calls to RallyRound. RallyRound owns all session state; DiscordStats is just a client.

## Requirements

### API Client Class

Create a reusable client class:

```typescript
// src/lib/rallyround-client.ts

interface RallyRoundClientConfig {
  baseUrl: string;        // e.g., "https://rallyround.example.com/api"
  webhookUrl: string;     // Our webhook endpoint for callbacks
  webhookSecret: string;  // Shared secret for webhook signing
}

class RallyRoundClient {
  constructor(config: RallyRoundClientConfig);

  // Sessions
  createSession(token: string, data: CreateSessionRequest): Promise<Session>;
  getSession(token: string, sessionId: string, include?: string[]): Promise<Session>;
  updateSession(token: string, sessionId: string, data: Partial<Session>): Promise<Session>;
  endSession(token: string, sessionId: string): Promise<SessionEndResult>;

  // Participants
  addParticipant(token: string, sessionId: string, participant: AddParticipantRequest): Promise<Participant>;
  removeParticipant(token: string, sessionId: string, odiscordId: string): Promise<void>;
  updateParticipantStatus(token: string, sessionId: string, odiscordId: string, status: string): Promise<Participant>;

  // Signals
  raiseSignal(token: string, sessionId: string, odiscordId: string, signal: ParticipantSignal): Promise<SignalResult>;
  clearSignal(token: string, sessionId: string, odiscordId: string): Promise<void>;

  // Speaker
  setSpeaker(token: string, sessionId: string, odiscordId: string): Promise<SpeakerResult>;
  nextSpeaker(token: string, sessionId: string): Promise<SpeakerResult>;
  clearSpeaker(token: string, sessionId: string): Promise<void>;
  clearQueue(token: string, sessionId: string): Promise<ClearQueueResult>;

  // Agenda
  getAgenda(token: string, sessionId: string): Promise<Agenda>;
  addAgendaItem(token: string, sessionId: string, item: AddAgendaItemRequest): Promise<AgendaItem>;
  updateAgendaItem(token: string, sessionId: string, itemId: string, data: Partial<AgendaItem>): Promise<AgendaItem>;
  removeAgendaItem(token: string, sessionId: string, itemId: string): Promise<void>;
  advanceAgenda(token: string, sessionId: string): Promise<AgendaAdvanceResult>;
  reorderAgenda(token: string, sessionId: string, itemIds: string[]): Promise<Agenda>;
}
```

### Type Definitions

Create shared types (or import from shared package):

```typescript
// src/types/rallyround.ts

type SessionStatus = 'scheduled' | 'active' | 'paused' | 'ended';
type SessionMode = 'unstructured' | 'structured';
type ParticipantStatus = 'ready' | 'away' | 'speaking' | 'queued' | 'disconnected';
type ParticipantSignal =
  | 'hand' | 'away'
  | 'point_of_order' | 'point_of_clarification' | 'point_of_information'
  | 'question' | 'agree' | 'disagree' | 'move_to_vote' | 'table';
type QueuePriority = 'interrupt' | 'high' | 'normal' | 'low';

interface Session {
  id: string;
  title: string;
  description?: string;
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  status: SessionStatus;
  mode: SessionMode;
  isRecording: boolean;
  facilitatorId: string;
  speakerId?: string;
  speakerStartedAt?: number;
  config: SessionConfig;
  createdAt: number;
  createdBy: string;
  dashboardUrl?: string;
}

interface Participant {
  odiscordId: string;
  discordUsername: string;
  discordAvatar?: string;
  status: ParticipantStatus;
  signal?: ParticipantSignal;
  signalTimestamp?: number;
  joinedAt: number;
  speakingTime: number;
}

interface Agenda {
  sessionId: string;
  currentItemIndex: number;
  items: AgendaItem[];
}

interface AgendaItem {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
}

// ... etc (see full types in RallyRound api-specification.md)
```

### Error Handling

Handle RallyRound API errors gracefully:

```typescript
class RallyRoundError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string
  ) {
    super(message);
  }
}

// Usage in client:
if (!response.ok) {
  const error = await response.json();
  throw new RallyRoundError(response.status, error.error, error.message);
}
```

### Session-Guild Mapping

Track active sessions per guild:

```typescript
// src/lib/session-registry.ts

class SessionRegistry {
  private sessions: Map<string, string> = new Map(); // guildId -> sessionId

  setActiveSession(guildId: string, sessionId: string): void;
  getActiveSession(guildId: string): string | undefined;
  clearSession(guildId: string): void;
  getSessionByChannel(voiceChannelId: string): string | undefined;
}
```

### Environment Variables

```
RALLYROUND_API_URL=https://rallyround.example.com/api
RALLYROUND_WEBHOOK_SECRET=shared_secret_here
```

## Acceptance Criteria

- [ ] RallyRoundClient class implements all methods
- [ ] All API responses properly typed
- [ ] Errors thrown as RallyRoundError with code and message
- [ ] Token passed in Authorization header on all requests
- [ ] Webhook URL and secret included in session creation
- [ ] SessionRegistry tracks active session per guild
- [ ] Request timeout handling (30s default)
- [ ] Retry logic for transient failures (503, network errors)

## Testing

1. Unit tests with mocked HTTP responses
2. Integration test against local RallyRound instance
3. Error handling tests for various HTTP status codes

## Related

- Depends on: OAuth implementation (Issue #1)
- Used by: Bot Commands (Issue #3)
- See: `docs/design/api-specification.md` in RallyRound repo for full API spec
