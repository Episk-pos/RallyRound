# Bot Commands for Live Speaker Management

## Summary

Implement `!rr` prefixed Discord chat commands that allow users to interact with RallyRound live sessions from Discord. Commands translate to RallyRound API calls.

## Background

Users in a Discord voice channel should be able to control sessions, raise signals, manage the speaker queue, and update the agenda without leaving Discord. The bot parses commands and calls the RallyRound API.

## Requirements

### Command Parser

Create a command parser that:
1. Listens for messages starting with `!rr`
2. Parses command and arguments
3. Validates user permissions
4. Calls appropriate RallyRound API endpoint
5. Responds with formatted result or error

```typescript
// src/commands/parser.ts

interface ParsedCommand {
  command: string;        // e.g., "start", "hand", "agenda"
  subcommand?: string;    // e.g., "add", "next"
  args: string[];         // Remaining arguments
  rawArgs: string;        // Full argument string
}

function parseCommand(content: string): ParsedCommand | null;
```

### Command Handlers

#### Session Management (Facilitator Only)

| Command | Action | API Call |
|---------|--------|----------|
| `!rr start [title]` | Create new session | `POST /api/sessions` |
| `!rr end` | End session | `DELETE /api/sessions/:id` |
| `!rr pause` | Pause session | `PATCH /api/sessions/:id` |
| `!rr resume` | Resume session | `PATCH /api/sessions/:id` |
| `!rr link` | Post dashboard URL | (local, no API) |
| `!rr status` | Show session status | `GET /api/sessions/:id` |

#### Mode Control (Facilitator Only)

| Command | Action | API Call |
|---------|--------|----------|
| `!rr mode unstructured` | Switch to unstructured | `PATCH /api/sessions/:id` |
| `!rr mode structured` | Switch to structured | `PATCH /api/sessions/:id` |
| `!rr record start` | Start recording indicator | `PATCH /api/sessions/:id` |
| `!rr record stop` | Stop recording indicator | `PATCH /api/sessions/:id` |

#### Speaker Management (Facilitator Only)

| Command | Action | API Call |
|---------|--------|----------|
| `!rr next` | Next speaker in queue | `POST /api/sessions/:id/speaker/next` |
| `!rr speaker @user` | Give floor to user | `POST /api/sessions/:id/speaker` |
| `!rr clear` | Clear speaker queue | `DELETE /api/sessions/:id/speaker/queue` |
| `!rr queue` | Show current queue | `GET /api/sessions/:id` |

#### Participant Commands (Everyone in VC)

| Command | Action | API Call |
|---------|--------|----------|
| `!rr hand` | Toggle raise hand | `POST/DELETE /api/sessions/:id/signals` |
| `!rr point order` | Point of order | `POST /api/sessions/:id/signals` |
| `!rr point clarify` | Point of clarification | `POST /api/sessions/:id/signals` |
| `!rr point info` | Point of information | `POST /api/sessions/:id/signals` |
| `!rr question` | Signal question | `POST /api/sessions/:id/signals` |
| `!rr agree` | Signal agreement | `POST /api/sessions/:id/signals` |
| `!rr disagree` | Signal disagreement | `POST /api/sessions/:id/signals` |
| `!rr away` | Mark as away | `PATCH /api/sessions/:id/participants/:id` |
| `!rr back` | Mark as returned | `PATCH /api/sessions/:id/participants/:id` |

#### Agenda Commands

| Command | Action | API Call |
|---------|--------|----------|
| `!rr agenda` | Show agenda | `GET /api/sessions/:id/agenda` |
| `!rr agenda add [item]` | Add agenda item | `POST /api/sessions/:id/agenda` |
| `!rr agenda next` | Advance to next item | `POST /api/sessions/:id/agenda/next` |
| `!rr agenda done` | Mark current complete | `PATCH /api/sessions/:id/agenda/:itemId` |
| `!rr agenda skip` | Skip current item | `PATCH /api/sessions/:id/agenda/:itemId` |

#### Utility Commands

| Command | Action |
|---------|--------|
| `!rr help` | Show help message |
| `!rr sfx [name]` | Play sound effect |
| `!rr sfx list` | List available sounds |
| `!rr sfx on/off` | Toggle sound effects |

### Permission Checking

```typescript
// src/commands/permissions.ts

interface CommandContext {
  guildId: string;
  channelId: string;
  userId: string;
  userToken: string;        // Discord OAuth token
  session: Session | null;  // Current session if exists
}

function isFacilitator(ctx: CommandContext): boolean {
  return ctx.session?.facilitatorId === ctx.userId;
}

function isInVoiceChannel(ctx: CommandContext): boolean {
  // Check if user is in the session's voice channel
}

function canUseStructuredSignals(ctx: CommandContext): boolean {
  return ctx.session?.mode === 'structured';
}
```

### Response Formatting

Format bot responses nicely:

```typescript
// src/commands/formatters.ts

function formatSessionStatus(session: Session): string;
function formatQueue(queue: SpeakerQueueEntry[]): string;
function formatAgenda(agenda: Agenda): string;
function formatError(error: RallyRoundError): string;
```

Example responses:

**Status:**
```
📊 **Session Status**
Title: Weekly Standup
Mode: Structured 📋
Speaker: @alice (3:42)
Queue: 3 waiting
Agenda: "Budget Review" (2/5)
Recording: 🔴 Yes
```

**Queue:**
```
📋 **Speaker Queue**
1. @bob (✋ Hand) - 2:30
2. @carol (📌 Clarification) - 1:15
3. @dave (❓ Question) - 0:45
```

**Agenda:**
```
📝 **Agenda**
☑️ Opening remarks
◉ Budget discussion ← current
○ Q&A from community
○ Action items
○ Closing
```

### Error Messages

```typescript
const ERROR_MESSAGES = {
  NO_SESSION: "No active session in this channel. Use `!rr start [title]` to create one.",
  NOT_FACILITATOR: "Only the facilitator can use this command.",
  NOT_IN_VC: "You must be in the voice channel to use this command.",
  STRUCTURED_ONLY: "This signal is only available in structured mode.",
  UNKNOWN_COMMAND: "Unknown command. Use `!rr help` for available commands.",
};
```

### Handler Registration

```typescript
// src/commands/index.ts

const handlers: Map<string, CommandHandler> = new Map([
  ['start', handleStart],
  ['end', handleEnd],
  ['hand', handleHand],
  ['point', handlePoint],
  ['agenda', handleAgenda],
  // ... etc
]);

async function handleCommand(message: Message): Promise<void> {
  const parsed = parseCommand(message.content);
  if (!parsed) return;

  const handler = handlers.get(parsed.command);
  if (!handler) {
    await message.reply(ERROR_MESSAGES.UNKNOWN_COMMAND);
    return;
  }

  const ctx = await buildContext(message);
  await handler(ctx, parsed);
}
```

## Acceptance Criteria

- [ ] All commands in tables above implemented
- [ ] Facilitator-only commands check permissions
- [ ] Participant commands require VC presence
- [ ] Structured signals only work in structured mode
- [ ] Clear error messages for all failure cases
- [ ] Nicely formatted response messages
- [ ] `!rr help` shows categorized command list
- [ ] Commands work with mentions (`!rr speaker @alice`)
- [ ] Toggle behavior for signals (raise/lower)

## Testing

1. Test each command with valid input
2. Test permission checks (non-facilitator, not in VC)
3. Test mode restrictions (structured signals in unstructured)
4. Test error handling (API failures, invalid args)
5. Test help command shows all commands

## Related

- Depends on: RallyRound API Client (Issue #2)
- Used by: VC Presence Tracking (Issue #4) for participant sync
