# Discord OAuth Provider for RallyRound Integration

## Summary

Implement Discord OAuth endpoints that RallyRound can use for authentication. DiscordStats will be the OAuth provider, and RallyRound will validate tokens against our `/auth/validate` endpoint.

## Background

RallyRound is building a live speaker management system for Discord voice channels. Users need to authenticate with their Discord identity to participate in sessions. Rather than duplicating OAuth logic, DiscordStats will serve as the central OAuth provider.

## Requirements

### Endpoints to Implement

#### 1. `GET /auth/discord`
Initiates the Discord OAuth flow.

**Query Parameters:**
- `redirect_uri` (optional): Where to redirect after auth (default: DiscordStats dashboard)
- `state` (optional): CSRF prevention token

**Behavior:**
1. Generate state token if not provided
2. Store state in session/Redis for verification
3. Redirect to Discord authorization URL with scopes: `identify`, `guilds`

#### 2. `GET /auth/discord/callback`
Handles the OAuth callback from Discord.

**Query Parameters:**
- `code`: Authorization code from Discord
- `state`: State token for CSRF verification

**Behavior:**
1. Verify state token matches stored value
2. Exchange code for access token with Discord API
3. Fetch user info from Discord API
4. Generate JWT containing user info
5. Redirect to `redirect_uri` with `?token={jwt}`

#### 3. `GET /auth/validate`
Validates a JWT token (called by RallyRound on every API request).

**Headers:**
- `Authorization: Bearer {token}`

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

**Error Response (401):**
```json
{
  "valid": false,
  "error": "Token expired"
}
```

#### 4. `GET /auth/user`
Returns full user profile for authenticated user.

**Headers:**
- `Authorization: Bearer {token}`

**Response:** User object with guilds array

### JWT Token Structure

```typescript
interface TokenPayload {
  sub: string;           // Discord user ID
  username: string;
  discriminator: string;
  avatar?: string;
  email?: string;
  iat: number;           // Issued at
  exp: number;           // Expires at (24 hours recommended)
}
```

### Environment Variables Needed

```
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
JWT_SECRET=             # For signing tokens
RALLYROUND_URL=         # Allowed redirect origin
```

## Acceptance Criteria

- [ ] `/auth/discord` redirects to Discord OAuth with correct scopes
- [ ] `/auth/discord/callback` exchanges code and issues JWT
- [ ] `/auth/validate` correctly validates tokens and returns user info
- [ ] `/auth/user` returns full profile with guilds
- [ ] Tokens expire after 24 hours
- [ ] CORS configured to allow requests from RallyRound origin
- [ ] State token prevents CSRF attacks
- [ ] Invalid/expired tokens return 401 with clear error message

## Testing

1. Manual flow: Click login → Discord auth → Redirect with token
2. Validate token with curl: `curl -H "Authorization: Bearer {token}" /auth/validate`
3. Test expired token handling
4. Test invalid token handling

## Related

- RallyRound API Specification: See `docs/design/api-specification.md` in RallyRound repo
- RallyRound will call `/auth/validate` on every API request
