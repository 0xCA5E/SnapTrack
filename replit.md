# replit.md

## Overview

This is a React Native/Expo mobile application that captures images containing song information (like screenshots of playlists or music posts), uses AI vision to detect song titles and artists, and adds them to a local song queue. Users can then sync the queued songs to multiple music platform integrations (Spotify, YouTube Music, with Apple Music and Amazon Music coming soon).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: Expo (React Native) with file-based routing via expo-router
- **Navigation**: Tab-based navigation using @react-navigation/bottom-tabs with four main screens:
  - **Capture**: Select images and process them for song detection
  - **Queue**: View detected songs and sync to connected platforms
  - **Integrations**: Manage music platform connections and target playlists
  - **Flagged**: View and manage images that failed processing
- **Styling**: React Native StyleSheet with dark theme
- **UI Components**: Custom themed components with platform-specific implementations

### Backend Architecture
- **Server**: Express.js server running on port 3001 (configurable via API_PORT env var)
- **AI Integration**: OpenAI API for image analysis/song detection using vision capabilities
- **Spotify Integration**: Replit Connectors for OAuth token management

### YouTube Integration (Client-Side PKCE)
- **Authentication**: OAuth 2.0 Authorization Code Flow with PKCE (Proof Key for Code Exchange)
- **No Server Required**: Token exchange and refresh happen entirely on the client using only the Client ID (no client secret needed for native apps)
- **Token Storage**: Secure storage using AsyncStorage on the device
- **Scope**: Uses `youtube.force-ssl` scope for full playlist management (add videos, read playlists)

### Service Layer Pattern
The app uses a clean service layer architecture:
- **songDetectionService**: Handles AI-powered song detection from images via the Express backend
- **songQueueService**: Manages local song queue with sync status tracking per platform
- **integrationsService**: Tracks platform connection status and selected playlists
- **spotifyService**: Manages Spotify API interactions (playlists, tracks, search)
- **youtubeService**: Manages YouTube API interactions via client-side authenticated calls
- **youtubeAuthService**: Handles YouTube OAuth with PKCE, token storage, and refresh
- **processingService**: Orchestrates the image processing workflow, manages flagged images

### Data Storage
- **Local Storage**: AsyncStorage for:
  - Song queue with sync status per platform
  - Integration connection states and selected playlists
  - Flagged images for failed detections
  - YouTube OAuth tokens (access_token, refresh_token, expires_at)

### Key Design Decisions

1. **Local Song Queue**: Songs are added to a local queue first, then synced to multiple platforms. This allows batch syncing and shows sync status per platform.

2. **Multi-Platform Support**: Architecture supports multiple music platforms. Each song tracks its sync status independently for each platform (Spotify, YouTube, etc.).

3. **Separate Express Server**: The backend runs independently to handle Spotify integration via Replit Connectors and AI-powered song detection.

4. **Client-Side YouTube Auth**: YouTube OAuth uses PKCE flow entirely on the client, eliminating the need for a client secret and server-side token handling. This is the recommended approach for native/mobile apps.

5. **Integration-Based Architecture**: Each music platform has its own service, making it easy to add new platforms in the future.

6. **Sync Status Visualization**: Each song shows colored badges (S=Spotify green, Y=YouTube red) indicating which platforms it has been synced to.

## External Dependencies

### Third-Party Services
- **Spotify Web API**: For playlist management, track search, and adding songs
- **YouTube Data API v3**: For playlist management, video search, and adding to playlists
- **OpenAI API**: For image analysis and song detection (accessed via Replit AI Integrations)

### Key NPM Packages
- **expo & expo-router**: Core framework and file-based routing
- **openai**: OpenAI SDK for vision/chat completions
- **express & cors**: Backend API server
- **@react-native-async-storage/async-storage**: Local data persistence
- **expo-image-picker**: Image selection from device
- **expo-auth-session**: OAuth authentication flows
- **expo-crypto**: Cryptographic functions for PKCE

### Environment Variables Required
- `AI_INTEGRATIONS_OPENAI_API_KEY`: OpenAI API key (via Replit AI Integrations)
- `AI_INTEGRATIONS_OPENAI_BASE_URL`: OpenAI API base URL
- `REPLIT_CONNECTORS_HOSTNAME`: Replit connectors endpoint for Spotify OAuth
- `REPL_IDENTITY` or `WEB_REPL_RENEWAL`: Replit authentication tokens
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID`: Google OAuth Client ID for YouTube integration (exposed to client)
- `API_PORT`: Optional, defaults to 3001

## YouTube OAuth Setup

To enable YouTube integration:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the **YouTube Data API v3**
4. Go to **APIs & Services > Credentials**
5. Create an **OAuth 2.0 Client ID**:
   - For mobile apps: Select "iOS" or "Android" application type
   - For web/Expo Go testing: Select "Web application" type
6. Add authorized redirect URIs for your app (e.g., your Expo redirect URI)
7. Copy the Client ID (client secret is NOT required for native apps using PKCE)
8. Add it as an environment variable: `EXPO_PUBLIC_GOOGLE_CLIENT_ID`

Once configured, users can tap "Connect" on YouTube in the Integrations tab to authenticate.

**Note**: The client secret is not required because this app uses PKCE (Proof Key for Code Exchange), which is the secure OAuth flow for native/mobile applications that cannot safely store a client secret.

## Workflow

1. **Capture**: User selects photos containing song information
2. **Detection**: AI analyzes images and extracts song titles/artists
3. **Queue**: Detected songs are added to local queue (not yet synced)
4. **Integrations**: User connects music platforms and selects target playlists
5. **Sync**: User syncs queue songs to connected platforms (songs show sync status)
6. **Clear**: Queue can be cleared; songs remain in platform playlists

## Recent Changes

### January 2026 - YouTube PKCE Refactor
- Migrated YouTube authentication from server-side to client-side PKCE flow
- Removed `GOOGLE_CLIENT_SECRET` requirement (no longer needed for native PKCE)
- All YouTube API calls now happen directly from the client using stored tokens
- Simplified scope to just `youtube.force-ssl` for playlist management
- Removed YouTube-related routes from the Express server (auth exchange, playlists, etc.)
- Token storage moved to AsyncStorage on the device
