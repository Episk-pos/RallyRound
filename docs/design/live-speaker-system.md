# Live Speaker System - Architecture & Design Document

## Overview

A system for facilitating structured voice chat (VC) sessions where speakers need protocol-based tools to manage discussions, participants can signal intent, and everyone has visibility into the session state.

**Core Philosophy**: Enable both freeform conversation AND structured parliamentary-style discourse, with the facilitator (speaker) controlling which mode is active.

---

## System Components

### 1. Web Dashboard

A real-time web interface accessible to all session participants.

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

### 2. Discord Bot

A bot that lives in the Discord server and bridges the VC with the web dashboard.

**Capabilities**:
- Responds to chat commands in the VC text channel
- Plays sound effects for session events (optional, configurable)
- Posts session state updates to chat
- Can be invoked to start/end sessions

### 3. Mode System

The session operates in one of three modes:

| Mode | Description | Available Signals |
|------|-------------|-------------------|
| **Unstructured** | Casual conversation, minimal protocol | Raise Hand, Step Away |
| **Structured** | Parliamentary rules, formal signals | Full protocol suite |
| **Recording** | Session is being recorded, visual indicator | Inherits from current mode |

*Recording is an overlay on top of either Unstructured or Structured mode.*

---

## Data Models

### Session

```typescript
interface Session {
  id: string;                          // session_${timestamp}_${random}
  topicId?: string;                    // Optional link to existing Topic
  title: string;
  description?: string;

  // Discord context
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

### Participant

```typescript
interface Participant {
  odiscordId: string;
  odiscordUsername: string;
  discordAvatar?: string;

  // Auth linkage (optional - for persistent identity)
  seaPub?: string;                     // GunDB public key if authenticated

  // Session state
  sessionId: string;
  status: ParticipantStatus;
  signal?: ParticipantSignal;          // Active signal (if any)
  signalTimestamp?: number;

  // Tracking
  joinedAt: number;
  speakingTime: number;                // Total seconds spoken this session
  signalCount: number;                 // How many signals raised
}

type ParticipantStatus =
  | 'ready'        // 🟢 Present and engaged
  | 'away'         // 🟡 Stepped away / AFK
  | 'speaking'     // 🎤 Currently has the floor
  | 'queued'       // 📋 In speaker queue
  | 'disconnected' // 🔴 Left VC

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

### Speaker Queue

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

### Agenda

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

**Sound Effects** (when enabled):
- Hand raised: Soft chime
- Point of Order: Gavel tap
- Speaker change: Transition tone
- Recording started: "Recording" announcement
- Agenda item complete: Checkmark sound

---

## Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Discord   │────▶│  RallyRound │────▶│   GunDB     │
│   OAuth     │     │   Server    │     │   SEA ID    │
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │                   │
      │ 1. User clicks     │                   │
      │    "Login with     │                   │
      │    Discord"        │                   │
      │                    │                   │
      │ 2. Discord OAuth   │                   │
      │    callback with   │                   │
      │    user info       │                   │
      │                    │                   │
      │                    │ 3. Generate       │
      │                    │    deterministic  │
      │                    │    SEA seed from  │
      │                    │    Discord ID     │
      │                    │                   │
      │                    │                   │ 4. Authenticate
      │                    │                   │    with GunDB
      │                    │                   │
      ▼                    ▼                   ▼
   Discord ID ─────▶ SEA Public Key ─────▶ Cryptographic
   + username        (persistent)          identity for
   + avatar                                real-time sync
```

**Benefits**:
- Single click login (Discord already authenticated)
- Persistent cryptographic identity across sessions
- Discord username/avatar available for display
- Can correlate web actions with Discord VC participation

---

## Discord Bot Commands

Commands are issued in the text channel associated with the VC:

### Session Management (Facilitator only)
```
!session start [title]     - Start a new session
!session end               - End the current session
!session pause             - Pause the session
!session resume            - Resume paused session
```

### Mode Control (Facilitator only)
```
!mode unstructured         - Switch to unstructured mode
!mode structured           - Switch to structured mode
!record start              - Begin recording
!record stop               - Stop recording
```

### Speaker Management (Facilitator only)
```
!speaker next              - Give floor to next in queue
!speaker @user             - Give floor to specific user
!speaker clear             - Clear the speaker queue
!queue show                - Display current queue
```

### Participant Commands (Everyone)
```
!hand                      - Raise hand (toggle)
!point order               - Point of order
!point clarify             - Point of clarification
!point info                - Point of information
!question                  - Signal you have a question
!agree                     - Signal agreement
!disagree                  - Signal disagreement
!away                      - Mark yourself as away
!back                      - Mark yourself as returned
```

### Agenda (Facilitator or allowed participants)
```
!agenda show               - Display agenda
!agenda add [item]         - Add item to agenda
!agenda next               - Move to next agenda item
!agenda done               - Mark current item complete
!agenda skip               - Skip current item
```

### Sound Effects
```
!sfx [name]                - Play a sound effect (if enabled)
!sfx list                  - List available sounds
```

---

## Real-time Sync Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Web Dashboard  │◀───▶│     GunDB       │◀───▶│  Discord Bot    │
│   (React)       │     │   (P2P Sync)    │     │   (Node.js)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       │                       │
        ▼                       ▼                       ▼
   User actions          Shared state:            Discord events:
   - Click signal        - Session                - VC join/leave
   - Update agenda       - Participants           - Chat commands
   - Speaker controls    - Queue                  - Reactions
                         - Agenda
                         - Mode
```

**GunDB Graph Structure**:
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

---

## UI/UX Design Principles

### 1. Visibility
- Current mode always visible in header
- Recording indicator prominent (red dot + text)
- Speaker clearly distinguished
- Queue order transparent to all

### 2. Accessibility
- Large, clear buttons for signals
- Color + icon for each state (not color alone)
- Keyboard shortcuts for common actions
- Screen reader compatible

### 3. Minimal Friction
- One-click Discord login
- Dashboard auto-joins session from URL
- Signals are single-tap/click
- Mobile-responsive layout

### 4. Facilitator Power
- Clear visual distinction for facilitator controls
- Ability to override/clear signals
- Direct speaker selection
- Agenda manipulation

---

## Sound Effect System

Two implementation options:

### Option A: Bot Joins VC (Recommended)
- Bot joins the voice channel
- Plays audio directly via Discord.js voice
- High quality, synchronized for all
- Requires bot to maintain voice connection

### Option B: API-based Audio
- Bot triggers audio via Discord API
- May have latency
- Simpler implementation
- No voice connection needed

**Available Sounds**:
| Event | Sound | File |
|-------|-------|------|
| Hand Raised | Soft chime | `hand.mp3` |
| Point of Order | Gavel tap | `gavel.mp3` |
| Speaker Change | Transition swoosh | `transition.mp3` |
| Recording Start | "Recording" voice | `recording-start.mp3` |
| Recording Stop | "Recording stopped" | `recording-stop.mp3` |
| Agenda Complete | Checkmark ding | `complete.mp3` |
| Time Warning | Gentle bell | `time-warning.mp3` |

---

## Session Lifecycle

```
SCHEDULED ──▶ ACTIVE ──▶ PAUSED ──▶ ACTIVE ──▶ ENDED
    │            │          │          │          │
    │            │          │          │          │
    ▼            ▼          ▼          ▼          ▼
  Optional    Session    Facilitator  Resume    Session
  start time  begins     pauses       play      archived
              Mode set   State saved            Stats saved
```

---

## Security Considerations

1. **Facilitator Authorization**
   - Only the session creator or designated facilitators can use admin commands
   - Facilitator list stored in session config

2. **Signal Rate Limiting**
   - Prevent spam by limiting signal frequency
   - Cool-down period after signal cleared

3. **Session Access**
   - Sessions tied to specific Discord guild
   - Participants must be in the VC to fully interact
   - View-only mode for observers (optional)

4. **Recording Consent**
   - Clear visual indicator when recording
   - Option to announce recording start in VC

---

## Future Considerations

- **Voting System**: Formal yes/no/abstain votes with results
- **Timer Display**: Visible countdown for speaker time limits
- **Breakout Support**: Multiple simultaneous sub-sessions
- **Transcription**: Integration with transcription services
- **Analytics**: Post-session reports on participation, speaking time
- **Templates**: Reusable session configurations

---

## Open Questions for Discussion

1. **Should non-Discord users be able to view sessions?**
   - Read-only dashboard access without Discord auth?

2. **Should signals persist across mode switches?**
   - Clear queue when switching to unstructured?

3. **How should we handle VC disconnects?**
   - Auto-remove from queue? Grace period?

4. **Should there be a "co-facilitator" role?**
   - Delegate some but not all powers?

5. **Recording storage**
   - Where do recordings go? User responsibility or platform feature?
