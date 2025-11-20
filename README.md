# RallyRound

A decentralized community organizing tool that helps groups coordinate presentations and discussions through a two-stage process: interest gathering and scheduling.

## Overview

RallyRound enables communities to:
- **Stage 1**: Create topics and gather interest from community members
- **Stage 2**: Schedule sessions once interest thresholds are met using Google Calendar integration

Built with a peer-to-peer architecture using GunDB for decentralized data storage and Google OAuth for authentication and calendar integration.

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
- **Cryptographic Identity**: RSA key pairs linked to Google accounts via signed certificates
- **Rolling Key Management**: Maximum 100 keys per user with automatic cleanup
- **Real-time Updates**: Live synchronization of topic changes across all clients
- **Calendar Integration**: Read availability and create events in participants' Google Calendars

## Architecture

### Backend (Node.js + GunDB)

- Express server acting as GunDB seed peer
- Google OAuth authentication
- Certificate signing service for identity verification
- Key management with rolling window implementation
- Google Calendar API integration

### Frontend (Vanilla JS + GunDB)

- Client-side GunDB peer for P2P communication
- Real-time topic updates and interest tracking
- Modal-based UI for topic creation and scheduling
- Responsive design

### Security Model

1. **Authentication**: Google OAuth for user identity
2. **Key Management**: Server generates and signs RSA key pairs for each user session
3. **Certificates**: Server-signed certificates link Google accounts to public keys
4. **Distributed Directory**: Public keys and certificates stored in GunDB
5. **Verification**: All peers can verify signatures using the distributed public key directory
6. **Key Rotation**: Automatic cleanup maintains max 100 keys per user

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
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
npm install
```

### 3. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Google+ API
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

GUN_PEERS=http://localhost:8765/gun
APP_URL=http://localhost:8765
```

### 5. Start the Server

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

### 6. Access the Application

Open your browser and navigate to:
```
http://localhost:8765
```

## Usage Guide

### Creating a Topic

1. Sign in with your Google account
2. Click "Create New Topic"
3. Fill in the details:
   - **Title**: Topic name
   - **Description**: What the presentation/discussion is about
   - **Presenter**: Name of the person presenting
   - **Minimum Participants**: Required number of interested people
   - **Maximum Participants** (optional): Cap on participation
   - **Duration**: Session length in minutes
   - **Session Type**: One-time or recurring
   - **Recurrence** (if recurring): Weekly, bi-weekly, or monthly
4. Click "Create Topic"

### Expressing Interest

1. Browse topics in the "Stage 1: Gathering Interest" section
2. Click "I'm Interested" on topics you want to attend
3. Track progress with the visual progress bar
4. Remove interest by clicking "Remove Interest"

### Scheduling (Presenters Only)

1. Once a topic reaches its minimum participant threshold, it moves to Stage 2
2. As the presenter, click "Schedule Session"
3. The system will:
   - Check all participants' calendar availability
   - Propose a suitable time (currently defaults to 1 week out at 2 PM)
   - Create a calendar event for all participants

## Project Structure

```
RallyRound/
├── server/
│   ├── index.js                 # Main server file
│   ├── routes/
│   │   └── auth.js              # OAuth and calendar routes
│   └── services/
│       ├── keyManagement.js     # Key generation and management
│       └── certificateService.js # Certificate signing
├── client/
│   ├── index.html               # Main HTML file
│   ├── styles/
│   │   └── main.css             # Styling
│   └── js/
│       └── app.js               # Client-side application
├── .env.example                 # Environment variables template
├── .gitignore                   # Git ignore rules
├── package.json                 # Dependencies and scripts
└── README.md                    # This file
```

## API Endpoints

### Authentication

- `GET /auth/google` - Initiate Google OAuth flow
- `GET /auth/google/callback` - OAuth callback handler
- `GET /auth/user` - Get current user info
- `POST /auth/logout` - Logout current user

### Calendar

- `GET /auth/calendar/availability` - Get user's calendar availability
- `POST /auth/calendar/event` - Create a calendar event

### GunDB

- `GET /gun` - GunDB peer endpoint (WebSocket)

## Data Structure

### Topic Object

```javascript
{
  id: "topic_timestamp_randomid",
  title: "Topic Title",
  description: "Topic description",
  presenter: "Presenter Name",
  presenterEmail: "presenter@example.com",
  minParticipants: 5,
  maxParticipants: 20,
  duration: 60,
  type: "one-time" | "recurring",
  recurrence: "weekly" | "biweekly" | "monthly",
  stage: 1 | 2 | 3,
  createdAt: timestamp,
  createdBy: "creator@example.com",
  interested: {
    "user@example.com": {
      name: "User Name",
      timestamp: timestamp
    }
  },
  scheduledTime: timestamp // Only present when scheduled
}
```

## Security Considerations

### Current Implementation

- Session-based authentication with Google OAuth
- Private keys stored only in server-side sessions
- Server-signed certificates for public key verification
- Rolling key window prevents database bloat

### Production Recommendations

1. **Use HTTPS**: Enable SSL/TLS in production
2. **Secure Session Storage**: Use Redis or similar for session storage
3. **Persistent Server Keys**: Store server master key pair in secure key management service
4. **Rate Limiting**: Add rate limiting to prevent abuse
5. **Input Validation**: Implement comprehensive input validation
6. **Content Security Policy**: Add CSP headers
7. **Key Expiration**: Implement certificate expiration and renewal

## Future Enhancements

- [ ] Smart scheduling algorithm based on multiple participants' availability
- [ ] Email notifications for topic updates and scheduling
- [ ] Participant voting on proposed time slots
- [ ] Topic categories and filtering
- [ ] Search functionality
- [ ] User profiles and presentation history
- [ ] Discussion forums for scheduled topics
- [ ] Mobile application
- [ ] Custom peer discovery for fully decentralized operation
- [ ] End-to-end encryption for private topics

## Troubleshooting

### Common Issues

**Authentication fails:**
- Check that your Google OAuth credentials are correct
- Ensure redirect URI matches exactly (including port)
- Verify APIs are enabled in Google Cloud Console

**Topics not syncing:**
- Check GunDB connection in browser console
- Ensure server is running on correct port
- Clear browser localStorage and refresh

**Calendar integration not working:**
- Verify Google Calendar API is enabled
- Check that user has granted calendar permissions
- Ensure tokens are being stored in session correctly

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

See LICENSE file for details.

## Support

For questions or issues, please open an issue on GitHub.
