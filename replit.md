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
- **YouTube Integration**: Google YouTube Data API v3 for playlist management

### Service Layer Pattern
The app uses a clean service layer architecture:
- **songDetectionService**: Handles AI-powered song detection from images via the Express backend
- **songQueueService**: Manages local song queue with sync status tracking per platform
- **integrationsService**: Tracks platform connection status and selected playlists
- **spotifyService**: Manages Spotify API interactions (playlists, tracks, search)
- **youtubeService**: Manages YouTube API interactions (playlists, videos, search)
- **processingService**: Orchestrates the image processing workflow, manages flagged images

### Data Storage
- **Local Storage**: AsyncStorage for:
  - Song queue with sync status per platform
  - Integration connection states and selected playlists
  - Flagged images for failed detections

### Key Design Decisions

1. **Local Song Queue**: Songs are added to a local queue first, then synced to multiple platforms. This allows batch syncing and shows sync status per platform.

2. **Multi-Platform Support**: Architecture supports multiple music platforms. Each song tracks its sync status independently for each platform (Spotify, YouTube, etc.).

3. **Separate Express Server**: The backend runs independently to handle API credentials securely and provide a consistent endpoint for the mobile app.

4. **Integration-Based Architecture**: Each music platform has its own service, making it easy to add new platforms in the future.

5. **Sync Status Visualization**: Each song shows colored badges (S=Spotify green, Y=YouTube red) indicating which platforms it has been synced to.

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

### Environment Variables Required
- `AI_INTEGRATIONS_OPENAI_API_KEY`: OpenAI API key (via Replit AI Integrations)
- `AI_INTEGRATIONS_OPENAI_BASE_URL`: OpenAI API base URL
- `REPLIT_CONNECTORS_HOSTNAME`: Replit connectors endpoint for Spotify OAuth
- `REPL_IDENTITY` or `WEB_REPL_RENEWAL`: Replit authentication tokens
- `GOOGLE_CLIENT_ID`: Google OAuth Client ID for YouTube integration
- `GOOGLE_CLIENT_SECRET`: Google OAuth Client Secret for YouTube integration
- `API_PORT`: Optional, defaults to 3001

## YouTube OAuth Setup

To enable YouTube integration:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the **YouTube Data API v3**
4. Go to **APIs & Services > Credentials**
5. Create an **OAuth 2.0 Client ID** (Web application type)
6. Add authorized redirect URIs for your app
7. Copy the Client ID and Client Secret
8. Add them as secrets in Replit: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

Once configured, users can tap "Connect" on YouTube in the Integrations tab to authenticate.

## Workflow

1. **Capture**: User selects photos containing song information
2. **Detection**: AI analyzes images and extracts song titles/artists
3. **Queue**: Detected songs are added to local queue (not yet synced)
4. **Integrations**: User connects music platforms and selects target playlists
5. **Sync**: User syncs queue songs to connected platforms (songs show sync status)
6. **Clear**: Queue can be cleared; songs remain in platform playlists
