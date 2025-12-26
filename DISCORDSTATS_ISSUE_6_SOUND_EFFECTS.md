# Sound Effect Playback System

## Summary

Implement a sound effect system that plays audio cues in the Discord voice channel when session events occur (signals raised, speaker changes, recording starts, etc.).

## Background

Audio feedback helps participants stay aware of session events without constantly watching the dashboard. The bot joins the voice channel and plays short audio clips when triggered by webhooks or commands.

## Requirements

### Audio Player Setup

Use `@discordjs/voice` for audio playback:

```typescript
// src/voice/player.ts

import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior
} from '@discordjs/voice';
import { join } from 'path';

const players: Map<string, AudioPlayer> = new Map(); // sessionId -> player

function getOrCreatePlayer(sessionId: string): AudioPlayer {
  let player = players.get(sessionId);

  if (!player) {
    player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause
      }
    });
    players.set(sessionId, player);
  }

  return player;
}

function cleanupPlayer(sessionId: string): void {
  const player = players.get(sessionId);
  if (player) {
    player.stop();
    players.delete(sessionId);
  }
}
```

### Sound Files

Create sound effect files:

```
assets/sounds/
├── hand.mp3              # Soft chime for hand raise
├── gavel.mp3             # Gavel tap for point of order
├── transition.mp3        # Swoosh for speaker change
├── recording-start.mp3   # "Recording" voice announcement
├── recording-stop.mp3    # "Recording stopped" voice announcement
├── complete.mp3          # Checkmark ding for agenda completion
├── time-warning.mp3      # Gentle bell for time warning
├── error.mp3             # Error buzzer
└── notification.mp3      # Generic notification
```

**Specifications:**
- Format: MP3 or OGG
- Duration: 0.5-3 seconds
- Sample rate: 48kHz
- Bit rate: 128kbps minimum

### Play Sound Function

```typescript
// src/voice/sounds.ts

const SOUNDS_DIR = join(__dirname, '../../assets/sounds');

const soundFiles: Record<string, string> = {
  hand: 'hand.mp3',
  point_of_order: 'gavel.mp3',
  point_of_clarification: 'notification.mp3',
  point_of_information: 'notification.mp3',
  question: 'notification.mp3',
  transition: 'transition.mp3',
  'recording-start': 'recording-start.mp3',
  'recording-stop': 'recording-stop.mp3',
  complete: 'complete.mp3',
  'time-warning': 'time-warning.mp3',
  gavel: 'gavel.mp3',  // Manual trigger
  error: 'error.mp3'
};

async function playSound(sessionId: string, soundName: string): Promise<void> {
  const connection = getVoiceConnection(sessionId);
  if (!connection) {
    console.warn(`No voice connection for session ${sessionId}`);
    return;
  }

  const soundFile = soundFiles[soundName];
  if (!soundFile) {
    console.warn(`Unknown sound: ${soundName}`);
    return;
  }

  const filePath = join(SOUNDS_DIR, soundFile);
  const resource = createAudioResource(filePath);
  const player = getOrCreatePlayer(sessionId);

  connection.subscribe(player);
  player.play(resource);

  // Wait for sound to finish
  return new Promise((resolve) => {
    player.once(AudioPlayerStatus.Idle, () => {
      resolve();
    });
  });
}
```

### Signal-to-Sound Mapping

```typescript
// src/voice/signal-sounds.ts

const signalSounds: Record<ParticipantSignal, string | null> = {
  hand: 'hand',
  away: null,  // No sound for stepping away
  point_of_order: 'point_of_order',
  point_of_clarification: 'point_of_clarification',
  point_of_information: 'point_of_information',
  question: 'question',
  agree: null,  // No sound for agree/disagree
  disagree: null,
  move_to_vote: 'notification',
  table: 'notification'
};

async function playSignalSound(
  sessionId: string,
  signal: ParticipantSignal
): Promise<void> {
  const sound = signalSounds[signal];
  if (sound && shouldPlaySound(sessionId)) {
    await playSound(sessionId, sound);
  }
}
```

### Sound Effects Toggle

Track whether sounds are enabled per session:

```typescript
// src/voice/settings.ts

const soundSettings: Map<string, boolean> = new Map(); // sessionId -> enabled

function setSoundEnabled(sessionId: string, enabled: boolean): void {
  soundSettings.set(sessionId, enabled);
}

function shouldPlaySound(sessionId: string): boolean {
  // Default to enabled if not set
  return soundSettings.get(sessionId) ?? true;
}
```

### Manual Sound Commands

Allow facilitator to manually play sounds:

```typescript
// src/commands/sfx.ts

async function handleSfxCommand(ctx: CommandContext, parsed: ParsedCommand): Promise<void> {
  if (!isFacilitator(ctx)) {
    return ctx.reply(ERROR_MESSAGES.NOT_FACILITATOR);
  }

  const [subcommand] = parsed.args;

  switch (subcommand) {
    case 'on':
      setSoundEnabled(ctx.session.id, true);
      return ctx.reply('🔊 Sound effects enabled');

    case 'off':
      setSoundEnabled(ctx.session.id, false);
      return ctx.reply('🔇 Sound effects disabled');

    case 'list':
      const sounds = Object.keys(soundFiles).join(', ');
      return ctx.reply(`Available sounds: ${sounds}`);

    default:
      if (soundFiles[subcommand]) {
        await playSound(ctx.session.id, subcommand);
        return ctx.reply(`🔊 Playing: ${subcommand}`);
      }
      return ctx.reply(`Unknown sound. Use \`!rr sfx list\` to see available sounds.`);
  }
}
```

### Queue Management

Handle overlapping sounds:

```typescript
// src/voice/queue.ts

const soundQueues: Map<string, Promise<void>> = new Map();

async function queueSound(sessionId: string, soundName: string): Promise<void> {
  const currentQueue = soundQueues.get(sessionId) ?? Promise.resolve();

  const newQueue = currentQueue.then(async () => {
    await playSound(sessionId, soundName);
  });

  soundQueues.set(sessionId, newQueue);
  return newQueue;
}
```

### Voice Connection Integration

Ensure player is subscribed when connection established:

```typescript
// src/voice/connection.ts

async function joinSessionVC(
  guildId: string,
  channelId: string,
  sessionId: string
): Promise<VoiceConnection> {
  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false  // Need to be unmuted to play audio
  });

  // Initialize player
  const player = getOrCreatePlayer(sessionId);
  connection.subscribe(player);

  connections.set(sessionId, connection);
  return connection;
}
```

### Cleanup

Clean up when session ends:

```typescript
async function cleanupSession(sessionId: string): Promise<void> {
  cleanupPlayer(sessionId);
  soundSettings.delete(sessionId);
  soundQueues.delete(sessionId);
  await leaveSessionVC(sessionId);
}
```

## Dependencies

```json
{
  "@discordjs/voice": "^0.16.0",
  "sodium-native": "^4.0.0",
  "ffmpeg-static": "^5.2.0"
}
```

## Acceptance Criteria

- [ ] All sound files created/sourced
- [ ] `playSound()` function plays audio in VC
- [ ] Signal sounds mapped correctly
- [ ] Sounds can be enabled/disabled per session
- [ ] `!rr sfx on/off/list/[name]` commands work
- [ ] Sound queue prevents overlap
- [ ] Bot unmutes when playing sounds
- [ ] Cleanup on session end
- [ ] Graceful handling when bot not in VC

## Testing

1. Start session, verify bot joins VC
2. Raise hand, verify chime plays
3. Point of order, verify gavel plays
4. Toggle sounds off, verify silence
5. Manual `!rr sfx gavel`, verify plays
6. Rapid signals, verify queue works
7. End session, verify cleanup

## Sound Sources

Consider royalty-free sources:
- https://freesound.org
- https://mixkit.co/free-sound-effects/
- https://www.zapsplat.com

Or generate simple tones programmatically.

## Related

- Used by: Webhook Receiver (Issue #5)
- Depends on: VC Presence (Issue #4) for connection
