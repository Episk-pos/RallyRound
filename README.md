# RallyRound

A decentralized community organizing tool that helps groups coordinate presentations and discussions through a two-stage process: interest gathering and scheduling.

## Overview

RallyRound enables communities to:
- **Stage 1**: Create topics and gather interest from community members
- **Stage 2**: Schedule sessions once interest thresholds are met using Google Calendar integration

Built with a peer-to-peer architecture using GunDB SEA for decentralized data storage and cryptographic authentication, with Google OAuth for identity verification and calendar integration.

## Features

### Two-Stage Process

**Stage One: Gathering Interest**
- Presenters create topics with customizable parameters:
  - Minimum and maximum participant thresholds
  - Session duration
  - One-time or recurring sessions
  - Recurrence patterns (weekly, bi-weekly, monthly)
- Members express interest in topics
- Real-time interest tracking with visual progress indicators
- Automatic transition to Stage 2 when minimum threshold is met

**Stage Two: Scheduling**
- Integration with Google Calendar via OAuth
- Automatic availability checking for all interested participants
- Calendar event creation with all participants
- Support for recurring sessions

### Technical Features

- **Decentralized Architecture**: GunDB for peer-to-peer data synchronization
- **SEA Cryptographic Identity**: GunDB SEA (Security, Encryption, Authorization) for authenticated writes
- **Public-Read, User-Only-Write**: Topics stored in user space, verified automatically by peers
- **Real-time Updates**: Live synchronization of topic changes across all clients
- **Calendar Integration**: Read availability and create events in participants' Google Calendars

## Architecture

### Backend (Node.js + Express + GunDB)

```
┌─────────────┐     ┌─────────────────────────┐     ┌─────────────┐
│   Browser   │────▶│   Express Server        │────▶│   Google    │
│             │     │                         │     │   OAuth     │
│  1. OAuth   │     │  1. Verify Google auth  │     └─────────────┘
│  2. Get seed│◀────│  2. Generate SEA seed   │
│  3. Derive  │     │  3. Calendar API proxy  │
│     SEA keys│     │  4. GunDB relay peer    │
│  4. gun.user│     └───────────┬─────────────┘
│     .auth() │                 │
└──────┬──────┘                 │
       │                        │
       ▼                        ▼
┌─────────────────────────────────────────────┐
│              GunDB P2P Network              │
│                                             │
│  - Topics stored in user space (~pubkey)    │
│  - All writes cryptographically signed      │
│  - Peers verify signatures automatically    │
│  - Public discovery graph for topic listing │
└─────────────────────────────────────────────┘
```

- Express server acting as GunDB seed peer
- Google OAuth authentication
- SEA seed generation endpoint (HMAC-based deterministic seed)
- Google Calendar API integration

### Frontend (React + Vite + GunDB SEA)

- React SPA with TypeScript
- GunDB client with SEA for authenticated writes
- Deterministic keypair generation from server-provided seed
- Real-time topic updates and interest tracking
- Responsive design

### Security Model

1. **Google OAuth**: Verifies user identity
2. **Server-Generated Seed**: HMAC(secret, googleUserId) creates deterministic seed
3. **Client-Side Key Derivation**: SEA keypair derived from seed (same user = same keys)
4. **Authenticated Writes**: All GunDB writes signed with SEA keypair
5. **Peer Verification**: Other peers automatically verify signatures
6. **Public Discovery**: Topics discoverable via public graph, full data in protected user space

## Prerequisites

- Node.js (v18 or higher)
- npm
- Google Cloud Project with OAuth 2.0 credentials
- Google Calendar API enabled

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd RallyRound
```

### 2. Install Dependencies

```bash
# Install server dependencies
npm install

# Install client dependencies
cd client && npm install && cd ..
```

### 3. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Google+ API (or People API)
   - Google Calendar API
4. Configure OAuth consent screen:
   - Add your email as a test user
   - Add scopes: `userinfo.profile`, `userinfo.email`, `calendar.readonly`, `calendar.events`
5. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:8765/auth/google/callback`
6. Copy the Client ID and Client Secret

### 4. Environment Configuration

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
PORT=8765
NODE_ENV=development

GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:8765/auth/google/callback

SESSION_SECRET=generate_a_random_string_here
SEA_SECRET=generate_another_random_string_here

GUN_PEERS=http://localhost:8765/gun
APP_URL=http://localhost:8765
```

**Important**: `SEA_SECRET` is used to generate deterministic seeds. Keep it secure!

### 5. Start Development Servers

```bash
npm run dev
```

This starts both:
- Backend server on port 8765
- Vite dev server on port 3000 (with proxy to backend)

### 6. Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## Authentication Flow

RallyRound uses GunDB SEA with Google OAuth as the identity provider:

### Step 1: Google OAuth Authentication
1. User clicks "Sign in with Google"
2. User authorizes the application via Google OAuth
3. Server verifies with Google and creates a session
4. User is redirected back to the app

### Step 2: SEA Key Derivation
1. Client requests SEA seed from server (`/auth/sea-seed`)
2. Server generates deterministic seed: `HMAC(SEA_SECRET, googleUserId)`
3. Client derives SEA keypair from seed using `@gooddollar/gun-pk-auth`
4. Client authenticates to GunDB: `gun.user().auth(seaPair)`
5. User's public key (`user.is.pub`) becomes their GunDB identity

**Key Security Points:**
- Same Google user always gets the same SEA keypair (deterministic)
- Private keys derived client-side, never transmitted
- All writes to user space are cryptographically signed
- Other peers automatically verify signatures

## Project Structure

```
RallyRound/
├── server/
│   ├── index.js                 # Express + GunDB server
│   └── routes/
│       └── auth.js              # OAuth, SEA seed, calendar routes
├── client/
│   ├── src/
│   │   ├── components/          # React components
│   │   │   ├── Header.tsx
│   │   │   ├── Welcome.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── TopicCard.tsx
│   │   │   └── CreateTopicModal.tsx
│   │   ├── hooks/               # React hooks
│   │   │   ├── useAuth.ts       # Authentication state
│   │   │   └── useTopics.ts     # Topic CRUD with GunDB
│   │   ├── lib/                 # Utilities
│   │   │   ├── gun.ts           # GunDB initialization
│   │   │   └── sea-auth.ts      # SEA authentication
│   │   ├── types/               # TypeScript types
│   │   │   └── index.ts
│   │   ├── App.tsx              # Main app component
│   │   └── main.tsx             # Entry point
│   ├── vite.config.ts           # Vite config with proxy
│   └── package.json
├── .env.example                 # Environment variables template
├── package.json                 # Root package.json
└── README.md
```

## API Endpoints

### Authentication

- `GET /auth/google` - Initiate Google OAuth flow
- `GET /auth/google/callback` - OAuth callback handler
- `GET /auth/user` - Get current user info
- `GET /auth/sea-seed` - Get deterministic SEA seed for keypair derivation
- `POST /auth/logout` - Logout current user

### Calendar

- `GET /auth/calendar/availability` - Get user's calendar availability
- `POST /auth/calendar/event` - Create a calendar event

### GunDB

- `/gun` - GunDB peer endpoint (WebSocket)

## Data Model

### Topic (stored in user space: `~pubkey/topics/{id}`)

```typescript
interface Topic {
  id: string;
  title: string;
  description: string;
  presenter: string;
  presenterEmail: string;
  presenterPub: string;        // SEA public key
  minParticipants: number;
  maxParticipants?: number;
  duration: number;
  type: 'one-time' | 'recurring';
  recurrence?: 'weekly' | 'biweekly' | 'monthly';
  stage: 1 | 2 | 3;
  createdAt: number;
  scheduledTime?: number;
}
```

### Public Topic Reference (for discovery: `public-topics/{id}`)

```typescript
interface PublicTopicRef {
  id: string;
  title: string;
  presenter: string;
  presenterPub: string;
  minParticipants: number;
  stage: 1 | 2 | 3;
  interestCount: number;
  createdAt: number;
}
```

## Security Considerations

### Current Implementation

- **SEA Authentication**: GunDB's built-in cryptographic layer
- **Deterministic Keys**: Same user always gets same keypair
- **Server-Mediated Seed**: Server bridges Google identity to SEA identity
- **Automatic Verification**: Peers verify signatures without custom code

### Security Strengths

- All writes cryptographically signed
- Peers automatically reject invalid signatures
- User space protected by default (public-read, user-only-write)
- No custom certificate infrastructure needed

### Known Limitations

- **Server Dependency**: SEA seed generation requires server (for now)
- **SEA_SECRET Compromise**: Would allow impersonation of any user
- **Google Account Compromise**: Leads to GunDB identity compromise

### Production Recommendations

1. **Use HTTPS**: Critical for OAuth and session security
2. **Secure SEA_SECRET**: Store in secure key management (AWS KMS, HashiCorp Vault)
3. **Rate Limiting**: Prevent abuse of seed endpoint
4. **Audit Logging**: Log all seed requests

## Future Decentralization

The server's role is minimal and can be reduced further:

| Current | Future Options |
|---------|----------------|
| Server generates seed from Google ID | Client derives seed from Google ID directly |
| | DID/Verifiable Credentials |
| | Web3 wallet signatures as seed |

The SEA-based topic storage pattern remains unchanged regardless of how the seed is generated.

## Scripts

```bash
# Development (both server and client)
npm run dev

# Server only
npm run dev:server

# Client only
npm run dev:client

# Build client for production
npm run build

# Start production server
npm start
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

See LICENSE file for details.
