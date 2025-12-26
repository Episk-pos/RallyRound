# Voice Channel Presence Tracking

## Summary

Implement voice channel presence tracking to automatically sync participants with RallyRound when users join/leave the VC during an active session.

## Background

Discord VC presence is the source of truth for who is "in" a session. When users join or leave the voice channel, DiscordStats must notify RallyRound so the participant list stays accurate.

## Requirements

### Voice State Update Handler

Listen for Discord.js `voiceStateUpdate` events:

```typescript
// src/events/voice-state.ts

client.on('voiceStateUpdate', async (oldState, newState) => {
  const session = sessionRegistry.getSessionByChannel(
    newState.channelId || oldState.channelId
  );

  if (!session) return; // No active session in this channel

  if (!oldState.channelId && newState.channelId) {
    // User joined VC
    await handleUserJoined(session, newState);
  } else if (oldState.channelId && !newState.channelId) {
    // User left VC
    await handleUserLeft(session, oldState);
  } else if (oldState.channelId !== newState.channelId) {
    // User moved channels
    await handleUserMoved(session, oldState, newState);
  }
});
```

### User Joined Handler

When a user joins the session's VC:

```typescript
async function handleUserJoined(sessionId: string, state: VoiceState): Promise<void> {
  const user = state.member?.user;
  if (!user || user.bot) return; // Ignore bots

  try {
    await rallyRoundClient.addParticipant(getBotToken(), sessionId, {
      odiscordId: user.id,
      discordUsername: user.username,
      discordAvatar: user.avatar,
      source: 'discord'
    });

    // Optionally announce in text channel
    await announceJoin(sessionId, user);
  } catch (error) {
    if (error.statusCode === 200) {
      // Already in session, ignore
    } else {
      console.error('Failed to add participant:', error);
    }
  }
}
```

### User Left Handler

When a user leaves the session's VC:

```typescript
async function handleUserLeft(sessionId: string, state: VoiceState): Promise<void> {
  const user = state.member?.user;
  if (!user || user.bot) return;

  try {
    const result = await rallyRoundClient.removeParticipant(
      getBotToken(),
      sessionId,
      user.id
    );

    // If they were speaker or in queue, RallyRound handles cleanup
    if (result.wasSpeaker) {
      await announceInChannel(sessionId, `${user.username} left while speaking`);
    }
  } catch (error) {
    console.error('Failed to remove participant:', error);
  }
}
```

### Initial Sync on Session Start

When a session starts, sync all current VC members:

```typescript
async function syncExistingMembers(
  sessionId: string,
  voiceChannel: VoiceChannel
): Promise<void> {
  const members = voiceChannel.members.filter(m => !m.user.bot);

  for (const [_, member] of members) {
    await rallyRoundClient.addParticipant(getBotToken(), sessionId, {
      odiscordId: member.user.id,
      discordUsername: member.user.username,
      discordAvatar: member.user.avatar,
      source: 'discord'
    });
  }
}
```

### Bot VC Connection

The bot should join the VC when a session starts (for sound effects):

```typescript
// src/voice/connection.ts

import { joinVoiceChannel, VoiceConnection } from '@discordjs/voice';

const connections: Map<string, VoiceConnection> = new Map();

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
    selfMute: true  // Bot doesn't need to speak initially
  });

  connections.set(sessionId, connection);

  connection.on('stateChange', (oldState, newState) => {
    if (newState.status === 'disconnected') {
      handleBotDisconnect(sessionId);
    }
  });

  return connection;
}

async function leaveSessionVC(sessionId: string): Promise<void> {
  const connection = connections.get(sessionId);
  if (connection) {
    connection.destroy();
    connections.delete(sessionId);
  }
}
```

### Reconnection Handling

Handle bot disconnection gracefully:

```typescript
async function handleBotDisconnect(sessionId: string): Promise<void> {
  const session = sessionRegistry.getSession(sessionId);
  if (!session) return;

  // Notify facilitator
  await sendToChannel(session.textChannelId,
    "⚠️ Bot disconnected from voice. Sound effects unavailable. Attempting to reconnect..."
  );

  // Attempt reconnect with backoff
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      await joinSessionVC(session.guildId, session.voiceChannelId, sessionId);
      await sendToChannel(session.textChannelId, "✅ Bot reconnected to voice.");
      return;
    } catch (error) {
      attempts++;
      await sleep(2000 * attempts); // Exponential backoff
    }
  }

  await sendToChannel(session.textChannelId,
    "❌ Could not reconnect to voice. Session continues without sound effects."
  );
}
```

### Permission Checks

Check if user is in VC before allowing commands:

```typescript
function isUserInSessionVC(
  guildId: string,
  odiscordId: string,
  voiceChannelId: string
): boolean {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return false;

  const member = guild.members.cache.get(odiscordId);
  if (!member) return false;

  return member.voice.channelId === voiceChannelId;
}
```

## Acceptance Criteria

- [ ] Bot joins VC when session starts
- [ ] All existing VC members synced on session start
- [ ] New VC joins trigger `addParticipant` API call
- [ ] VC leaves trigger `removeParticipant` API call
- [ ] Channel moves handled correctly
- [ ] Bot users (other bots) are ignored
- [ ] Bot reconnects automatically if disconnected
- [ ] Facilitator notified of bot disconnect
- [ ] `isUserInSessionVC` check used by commands

## Testing

1. Start session, verify all VC members synced
2. Join VC during session, verify participant added
3. Leave VC, verify participant removed
4. Disconnect bot manually, verify reconnection
5. Move between channels, verify correct handling

## Related

- Used by: Bot Commands (Issue #3) for permission checks
- Used by: Sound Effects (Issue #6) for VC connection
