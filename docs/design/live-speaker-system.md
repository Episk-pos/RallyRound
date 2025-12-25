# Live Speaker System - Architecture & Design Document

## Overview

A system for facilitating structured voice chat (VC) sessions where speakers need protocol-based tools to manage discussions, participants can signal intent, and everyone has visibility into the session state.

**Core Philosophy**: Enable both freeform conversation AND structured parliamentary-style discourse, with the facilitator (speaker) controlling which mode is active.

---

## System Architecture (Two-Repo Split)

The system is split across two repositories for separation of concerns:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DISCORDSTATS REPO                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Discord Bot (Node.js)                        │   │
│  │  • Chat commands (!hand, !speaker, !agenda, etc.)                   │   │
│  │  • VC presence tracking (join/leave events)                         │   │
│  │  • Sound effect playback (via Discord.js voice)                     │   │
│  │  • Discord OAuth provider                                           │   │
│  │  • Webhook receiver for RallyRound events                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     │ REST API calls                        │
│                                     │ (session actions)                     │
│                                     ▼                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTPS
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                              RALLYROUND REPO                                │
│  ┌──────────────────────┐    ┌──────────────────────┐                      │
│  │   Web Dashboard      │    │   Express Server     │                      │
│  │   (React)            │    │                      │                      │
│  │                      │    │  • Session API       │                      │
│  │  • Session view      │    │  • Participant API   │                      │
│  │  • Signal controls   │◀──▶│  • Queue API         │                      │
│  │  • Agenda panel      │    │  • Agenda API        │                      │
│  │  • Participant list  │    │  • Webhooks (out)    │                      │
│  │  • Speaker display   │    │  • Auth validation   │                      │
│  └──────────────────────┘    └──────────────────────┘                      │
│            │                           │                                    │
│            │                           │                                    │
│            ▼                           ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         GunDB (P2P Real-time)                        │   │
│  │  • Session state                                                     │   │
│  │  • Participant presence                                              │   │
│  │  • Signal queue                                                      │   │
│  │  • Agenda items                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Repository Responsibilities

### RallyRound (This Repo)

**Owns:**
- Web dashboard UI (React)
- Session state management
- GunDB real-time sync
- Core business logic (queue priority, mode rules, etc.)
- REST API for session operations
- Outbound webhooks for Discord events (sound triggers, announcements)
- Session persistence and history

**Does NOT own:**
- Discord bot implementation
- Discord OAuth (but validates tokens from DiscordStats)
- Sound effect files or playback
- VC presence detection

### DiscordStats (External Repo)

**Owns:**
- Discord bot (Discord.js)
- Discord OAuth flow
- Chat command parsing and routing
- VC join/leave detection
- Sound effect playback in voice channels
- Discord-specific message formatting
- Webhook receiver for RallyRound events

**Does NOT own:**
- Session business logic
- Persistent session state
- Web dashboard
- Queue priority algorithms

---

## Integration Points

### 1. Authentication Flow

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User      │     │  DiscordStats   │     │   RallyRound    │
│   Browser   │     │  (OAuth host)   │     │   (Dashboard)   │
└─────────────┘     └─────────────────┘     └─────────────────┘
      │                     │                       │
      │ 1. Click "Login     │                       │
      │    with Discord"    │                       │
      │────────────────────▶│                       │
      │                     │                       │
      │ 2. Discord OAuth    │                       │
      │◀───────────────────▶│                       │
      │                     │                       │
      │ 3. Redirect with    │                       │
      │    token            │                       │
      │◀────────────────────│                       │
      │                     │                       │
      │ 4. Load dashboard   │                       │
      │    with token       │                       │
      │────────────────────────────────────────────▶│
      │                     │                       │
      │                     │ 5. Validate token     │
      │                     │◀──────────────────────│
      │                     │                       │
      │                     │ 6. Return user info   │
      │                     │──────────────────────▶│
      │                     │                       │
      │ 7. Dashboard ready  │                       │
      │◀───────────────────────────────────────────│
```

**DiscordStats provides:**
- `/auth/discord` - OAuth initiation
- `/auth/discord/callback` - OAuth callback
- `/auth/validate` - Token validation endpoint for RallyRound
- `/auth/user` - Get user info from token

**RallyRound consumes:**
- Validates incoming tokens against DiscordStats
- Generates deterministic SEA keypair from Discord user ID
- Stores Discord user info in session

### 2. Bot → RallyRound API

When users issue Discord commands, the bot calls RallyRound's API:

```
Discord Chat                  DiscordStats Bot              RallyRound API
─────────────                 ────────────────              ──────────────
"!hand"           ──────▶     Parse command      ──────▶   POST /api/sessions/{id}/signals
                              Add auth headers              { userId, signal: "hand" }

"!speaker next"   ──────▶     Parse command      ──────▶   POST /api/sessions/{id}/speaker/next
                              Verify facilitator            { facilitatorId }

"!agenda add X"   ──────▶     Parse command      ──────▶   POST /api/sessions/{id}/agenda
                                                           { title: "X", addedBy }
```

**RallyRound API Endpoints (for bot consumption):**

```
Sessions:
  POST   /api/sessions                    Create session
  GET    /api/sessions/:id                Get session state
  PATCH  /api/sessions/:id                Update session (mode, recording, etc.)
  DELETE /api/sessions/:id                End session

Participants:
  POST   /api/sessions/:id/participants   Join session
  DELETE /api/sessions/:id/participants/:odiscordId   Leave session
  PATCH  /api/sessions/:id/participants/:odiscordId   Update status

Signals:
  POST   /api/sessions/:id/signals        Raise signal
  DELETE /api/sessions/:id/signals/:odiscordId   Clear signal

Speaker:
  POST   /api/sessions/:id/speaker        Set speaker
  POST   /api/sessions/:id/speaker/next   Advance to next in queue
  DELETE /api/sessions/:id/speaker        Clear speaker

Agenda:
  GET    /api/sessions/:id/agenda         Get agenda
  POST   /api/sessions/:id/agenda         Add item
  PATCH  /api/sessions/:id/agenda/:itemId Update item
  DELETE /api/sessions/:id/agenda/:itemId Remove item
  POST   /api/sessions/:id/agenda/reorder Reorder items
```

### 3. RallyRound → DiscordStats Webhooks

When events occur in RallyRound that need Discord action:

```
RallyRound Event              Webhook Payload              DiscordStats Action
────────────────              ───────────────              ───────────────────
Signal raised        ──────▶  { event: "signal",     ──▶  Play sound in VC
                               signal: "hand",            Post reaction in chat
                               user: {...} }

Speaker changed      ──────▶  { event: "speaker",    ──▶  Play transition sound
                               from: {...},               Announce in chat
                               to: {...} }

Recording started    ──────▶  { event: "recording",  ──▶  Play announcement
                               action: "start" }          Post warning in chat

Agenda item done     ──────▶  { event: "agenda",     ──▶  Play completion sound
                               action: "complete",        Update pinned message
                               item: {...} }

Mode changed         ──────▶  { event: "mode",       ──▶  Announce in chat
                               mode: "structured" }       Update status
```

**Webhook Configuration:**
- RallyRound stores webhook URL per guild/session
- DiscordStats registers webhook URL when bot joins session
- Webhooks signed with shared secret for verification

---

## Data Models

### Session (RallyRound)

```typescript
interface Session {
  id: string;                          // session_${timestamp}_${random}
  topicId?: string;                    // Optional link to existing Topic
  title: string;
  description?: string;

  // Discord context (reference only - bot manages actual Discord state)
  guildId: string;                     // Discord server ID
  voiceChannelId: string;              // Discord VC ID
  textChannelId: string;               // Discord text channel for commands

  // State
  status: 'scheduled' | 'active' | 'paused' | 'ended';
  mode: 'unstructured' | 'structured';
  isRecording: boolean;

  // Participants
  facilitatorId: string;               // Discord user ID
  speakerId?: string;                  // Current speaker (Discord user ID)
  speakerStartedAt?: number;           // When current speaker started

  // Timing
  scheduledAt?: number;
  startedAt?: number;
  endedAt?: number;

  // Configuration
  config: SessionConfig;

  // Integration
  webhookUrl?: string;                 // DiscordStats webhook endpoint
  webhookSecret?: string;              // Signing secret

  createdAt: number;
  createdBy: string;                   // Discord user ID
}

interface SessionConfig {
  soundEffectsEnabled: boolean;
  autoAdvanceAgenda: boolean;          // Auto-check items when speaker moves on
  speakerTimeLimit?: number;           // Optional time limit per speaker (seconds)
  allowSelfQueue: boolean;             // Can participants queue themselves?
  requireFacilitatorApproval: boolean; // Must facilitator approve signals?
}
```

### Participant (RallyRound)

```typescript
interface Participant {
  odiscordId: string;
  odiscordUsername: string;
  discordAvatar?: string;

  // Auth linkage (for persistent identity)
  seaPub?: string;                     // GunDB public key if authenticated via dashboard

  // Session state
  sessionId: string;
  status: ParticipantStatus;
  signal?: ParticipantSignal;          // Active signal (if any)
  signalTimestamp?: number;

  // Tracking
  joinedAt: number;
  speakingTime: number;                // Total seconds spoken this session
  signalCount: number;                 // How many signals raised

  // Source tracking
  lastUpdateSource: 'dashboard' | 'discord';  // Where last action came from
}

type ParticipantStatus =
  | 'ready'        // 🟢 Present and engaged
  | 'away'         // 🟡 Stepped away / AFK
  | 'speaking'     // 🎤 Currently has the floor
  | 'queued'       // 📋 In speaker queue
  | 'disconnected' // 🔴 Left VC (reported by bot)

type ParticipantSignal =
  // Available in ALL modes
  | 'hand'              // ✋ Raise hand - wants to speak
  | 'away'              // 🔇 Stepping away

  // Available in STRUCTURED mode only
  | 'point_of_order'          // 📋 Point of Order - procedural concern
  | 'point_of_clarification'  // 📌 Point of Clarification - needs explanation
  | 'point_of_information'    // ℹ️  Point of Information - factual addition
  | 'question'                // ❓ Question for speaker
  | 'agree'                   // ✓  Agreement / second the motion
  | 'disagree'                // ✗  Disagreement / objection
  | 'move_to_vote'            // 🗳️  Motion to call for vote
  | 'table'                   // ⏸️  Motion to table discussion
```

### Speaker Queue (RallyRound)

```typescript
interface SpeakerQueueEntry {
  odiscordId: string;
  signal: ParticipantSignal;
  timestamp: number;
  priority: QueuePriority;
  acknowledged: boolean;              // Has facilitator seen this?
}

type QueuePriority =
  | 'interrupt'    // Point of Order - can interrupt speaker
  | 'high'         // Points of Clarification/Information
  | 'normal'       // Hand raise, Question
  | 'low'          // Agree/Disagree (acknowledgment, not floor request)
```

### Agenda (RallyRound)

```typescript
interface Agenda {
  sessionId: string;
  items: AgendaItem[];
  currentItemIndex: number;
}

interface AgendaItem {
  id: string;
  title: string;
  description?: string;
  duration?: number;                  // Estimated minutes
  status: 'pending' | 'active' | 'completed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
  addedBy: string;                    // Discord user ID
  addedAt: number;
}
```

---

## Mode System

The session operates in one of three modes:

| Mode | Description | Available Signals |
|------|-------------|-------------------|
| **Unstructured** | Casual conversation, minimal protocol | Raise Hand, Step Away |
| **Structured** | Parliamentary rules, formal signals | Full protocol suite |
| **Recording** | Session is being recorded, visual indicator | Inherits from current mode |

*Recording is an overlay on top of either Unstructured or Structured mode.*

---

## Signal Protocol (Structured Mode)

Inspired by Robert's Rules of Order and committee conventions:

| Signal | Symbol | Priority | Behavior |
|--------|--------|----------|----------|
| **Point of Order** | 📋 | Interrupt | Can interrupt; procedural/rules concern |
| **Point of Clarification** | 📌 | High | Queued next; needs something explained |
| **Point of Information** | ℹ️ | High | Queued next; has relevant fact to add |
| **Question** | ❓ | Normal | Standard queue; question for speaker |
| **Raise Hand** | ✋ | Normal | Standard queue; wants the floor |
| **Agree/Second** | ✓ | Low | Acknowledgment; visible but no floor |
| **Disagree/Object** | ✗ | Low | Acknowledgment; visible but no floor |
| **Move to Vote** | 🗳️ | Normal | Motion requiring second |
| **Table Discussion** | ⏸️ | Normal | Motion requiring second |

---

## Web Dashboard (RallyRound)

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  RallyRound Live                          [Mode: Structured 📋] │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │ 🎤 SPEAKER          │  │  AGENDA                          │  │
│  │                     │  │  ───────                         │  │
│  │  @facilitator       │  │  ☑ Opening remarks               │  │
│  │  Speaking: 3:42     │  │  ◉ Budget discussion  ← current  │  │
│  │                     │  │  ○ Q&A from community            │  │
│  │  [Pass Speaker]     │  │  ○ Action items                  │  │
│  └─────────────────────┘  │  ○ Closing                       │  │
│                           │                                  │  │
│  ┌─────────────────────┐  │  [+ Add Item] [↕ Reorder]        │  │
│  │ QUEUE (3)           │  └──────────────────────────────────┘  │
│  │  1. @alice (✋ Hand) │                                       │
│  │  2. @bob (📌 Point) │  ┌──────────────────────────────────┐  │
│  │  3. @carol (❓ Q)   │  │  MY CONTROLS                     │  │
│  └─────────────────────┘  │  ───────────                     │  │
│                           │  [✋ Raise Hand] [📌 Point of    │  │
│  ┌─────────────────────┐  │   Clarification]                 │  │
│  │ PARTICIPANTS (12)   │  │  [❓ Question] [📋 Point of      │  │
│  │  @dan      🟢 Ready │  │   Order]                         │  │
│  │  @eve      🟡 AFK   │  │  [🔇 Step Away] [✓ Agree]        │  │
│  │  @frank    🟢 Ready │  │  [✗ Disagree]                    │  │
│  │  ...                │  └──────────────────────────────────┘  │
│  └─────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Discord Bot Commands (DiscordStats)

Commands are issued in the text channel associated with the VC:

### Session Management (Facilitator only)
```
!rr start [title]          - Start a new session (creates in RallyRound)
!rr end                    - End the current session
!rr pause                  - Pause the session
!rr resume                 - Resume paused session
!rr link                   - Post dashboard link
```

### Mode Control (Facilitator only)
```
!rr mode unstructured      - Switch to unstructured mode
!rr mode structured        - Switch to structured mode
!rr record start           - Begin recording indicator
!rr record stop            - Stop recording indicator
```

### Speaker Management (Facilitator only)
```
!rr next                   - Give floor to next in queue
!rr speaker @user          - Give floor to specific user
!rr clear                  - Clear the speaker queue
!rr queue                  - Display current queue
```

### Participant Commands (Everyone)
```
!rr hand                   - Raise hand (toggle)
!rr point order            - Point of order
!rr point clarify          - Point of clarification
!rr point info             - Point of information
!rr question               - Signal you have a question
!rr agree                  - Signal agreement
!rr disagree               - Signal disagreement
!rr away                   - Mark yourself as away
!rr back                   - Mark yourself as returned
```

### Agenda (Facilitator or allowed participants)
```
!rr agenda                 - Display agenda
!rr agenda add [item]      - Add item to agenda
!rr agenda next            - Move to next agenda item
!rr agenda done            - Mark current item complete
!rr agenda skip            - Skip current item
```

### Sound Effects (DiscordStats handles playback)
```
!rr sfx [name]             - Play a sound effect (if enabled)
!rr sfx list               - List available sounds
!rr sfx on/off             - Enable/disable sound effects
```

*Note: Commands prefixed with `!rr` to namespace for RallyRound and avoid conflicts with other bots.*

---

## Sound Effect System (DiscordStats)

The bot joins the voice channel and plays audio directly via Discord.js voice.

**Event → Sound Mapping:**
| Event | Sound | Triggered By |
|-------|-------|--------------|
| Hand Raised | Soft chime | Webhook from RallyRound |
| Point of Order | Gavel tap | Webhook from RallyRound |
| Speaker Change | Transition swoosh | Webhook from RallyRound |
| Recording Start | "Recording" voice | Webhook from RallyRound |
| Recording Stop | "Recording stopped" | Webhook from RallyRound |
| Agenda Complete | Checkmark ding | Webhook from RallyRound |
| Time Warning | Gentle bell | Webhook from RallyRound |

**Sound Files Location:** `discordstats/assets/sounds/`

---

## Real-time Sync (RallyRound - GunDB)

```
live-sessions/
  {sessionId}/
    meta           → Session object
    participants/
      {odiscordId}  → Participant object
    queue/
      {odiscordId}  → SpeakerQueueEntry
    agenda         → Agenda object
    events/
      {eventId}    → Session event log
```

Both the web dashboard AND the RallyRound server subscribe to GunDB for real-time updates. The DiscordStats bot interacts only via REST API.

---

## Implementation Phases

### Phase 1: Foundation (RallyRound)
- [ ] Session data models and GunDB structure
- [ ] REST API for session CRUD
- [ ] Basic web dashboard (session view, participant list)
- [ ] Discord token validation endpoint

### Phase 2: Core Features (RallyRound)
- [ ] Signal system with queue priority
- [ ] Agenda management
- [ ] Mode switching
- [ ] Facilitator controls

### Phase 3: Discord Integration (DiscordStats)
- [ ] Bot command parser for `!rr` commands
- [ ] VC presence tracking
- [ ] API client for RallyRound
- [ ] Webhook receiver

### Phase 4: Audio & Polish (DiscordStats)
- [ ] Voice channel connection
- [ ] Sound effect playback
- [ ] Chat announcements
- [ ] Error handling

### Phase 5: Advanced Features (Both)
- [ ] Session history/analytics
- [ ] Co-facilitator support
- [ ] Voting system
- [ ] Timer displays

---

## Security Considerations

### API Security (RallyRound)
- All API endpoints require valid Discord token
- Token validated against DiscordStats `/auth/validate`
- Facilitator actions verify user is session facilitator
- Rate limiting on signal endpoints

### Webhook Security (Both)
- Webhooks signed with HMAC-SHA256
- Shared secret per guild, stored securely
- Timestamp validation to prevent replay
- IP allowlisting optional

### Bot Security (DiscordStats)
- Bot token stored in environment
- Command permissions checked per Discord role
- VC presence verified before accepting commands

---

## Open Questions for Discussion

1. **Should the dashboard work without the bot?**
   - Web-only sessions for non-Discord use cases?

2. **Should signals persist across mode switches?**
   - Clear queue when switching to unstructured?

3. **How should we handle VC disconnects?**
   - Grace period before removing from queue?

4. **Should there be a "co-facilitator" role?**
   - Delegate some but not all powers?

5. **Where should session recordings be stored?**
   - User responsibility or platform feature?

6. **Shared user identity between repos?**
   - Use Discord ID as primary key in both?
