import express, { Request, Response } from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = parseInt(process.env.API_PORT || '3001', 10);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// YouTube OAuth token storage (file-based for persistence)
const YOUTUBE_TOKENS_FILE = path.join(process.cwd(), '.youtube_tokens.json');

interface YouTubeTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

function loadYouTubeTokens(): YouTubeTokens | null {
  try {
    if (fs.existsSync(YOUTUBE_TOKENS_FILE)) {
      const data = fs.readFileSync(YOUTUBE_TOKENS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load YouTube tokens:', error);
  }
  return null;
}

function saveYouTubeTokens(tokens: YouTubeTokens): void {
  try {
    fs.writeFileSync(YOUTUBE_TOKENS_FILE, JSON.stringify(tokens, null, 2));
  } catch (error) {
    console.error('Failed to save YouTube tokens:', error);
  }
}

function clearYouTubeTokens(): void {
  try {
    if (fs.existsSync(YOUTUBE_TOKENS_FILE)) {
      fs.unlinkSync(YOUTUBE_TOKENS_FILE);
    }
  } catch (error) {
    console.error('Failed to clear YouTube tokens:', error);
  }
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

async function getSpotifyAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) {
    throw new Error('Spotify connection not available');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=spotify',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );

  const data = await response.json();
  const connectionSettings = data.items?.[0];

  const accessToken = connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token ||
    connectionSettings?.settings?.oauth?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Spotify not connected. Please connect your Spotify account.');
  }

  cachedAccessToken = accessToken;
  tokenExpiresAt = Date.now() + (3500 * 1000);

  return accessToken;
}

async function spotifyFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const accessToken = await getSpotifyAccessToken();

  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      cachedAccessToken = null;
      tokenExpiresAt = 0;
      throw new Error('Spotify session expired. Please try again.');
    }
    const errorText = await response.text();
    throw new Error(`Spotify API error: ${response.status} - ${errorText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

interface DetectedSong {
  title: string;
  artist: string;
  confidence: 'high' | 'medium' | 'low';
}

app.get('/api/spotify/playlists', async (req: Request, res: Response) => {
  try {
    const data = await spotifyFetch('/me/playlists?limit=50');

    const playlists = data.items.map((playlist: any) => ({
      id: playlist.id,
      name: playlist.name,
      trackCount: playlist.tracks?.total ?? 0,
      imageUrl: playlist.images?.[0]?.url,
    }));

    res.json({ playlists });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load playlists';
    console.error('Playlist error:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/spotify/playlists/:id/tracks', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const trackIds: string[] = [];

    let offset = 0;
    const limit = 50;

    while (true) {
      const data = await spotifyFetch(`/playlists/${id}/tracks?limit=${limit}&offset=${offset}&fields=items(track(id)),total`);

      for (const item of data.items) {
        if (item.track?.id) {
          trackIds.push(item.track.id);
        }
      }

      if (data.items.length < limit) break;
      offset += limit;
    }

    res.json({ trackIds });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load tracks';
    console.error('Tracks error:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/spotify/search', async (req: Request, res: Response) => {
  try {
    const { title, artist } = req.query;

    if (!title || !artist) {
      return res.status(400).json({ error: 'title and artist are required' });
    }

    const query = encodeURIComponent(`track:${title} artist:${artist}`);
    const data = await spotifyFetch(`/search?q=${query}&type=track&limit=1`);

    if (data.tracks.items.length === 0) {
      const fallbackQuery = encodeURIComponent(`${title} ${artist}`);
      const fallbackData = await spotifyFetch(`/search?q=${fallbackQuery}&type=track&limit=5`);

      if (fallbackData.tracks.items.length === 0) {
        return res.json({ result: null });
      }

      const track = fallbackData.tracks.items[0];
      return res.json({
        result: {
          trackId: track.id,
          name: track.name,
          artist: track.artists.map((a: any) => a.name).join(', '),
          album: track.album.name,
          imageUrl: track.album.images?.[0]?.url,
        }
      });
    }

    const track = data.tracks.items[0];
    res.json({
      result: {
        trackId: track.id,
        name: track.name,
        artist: track.artists.map((a: any) => a.name).join(', '),
        album: track.album.name,
        imageUrl: track.album.images?.[0]?.url,
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Search failed';
    console.error('Search error:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/spotify/playlists/:id/tracks', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { trackIds } = req.body;

    if (!trackIds || !Array.isArray(trackIds)) {
      return res.status(400).json({ error: 'trackIds array is required' });
    }

    const uris = trackIds.map((trackId: string) => `spotify:track:${trackId}`);

    const batchSize = 100;
    for (let i = 0; i < uris.length; i += batchSize) {
      const batch = uris.slice(i, i + batchSize);
      await spotifyFetch(`/playlists/${id}/tracks`, {
        method: 'POST',
        body: JSON.stringify({ uris: batch }),
      });
    }

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to add tracks';
    console.error('Add tracks error:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/detect-songs', async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a song identification expert. Analyze images containing song information (Shazam screenshots, music apps, radio displays, signage, playlists, etc.) and extract song details.

For each song you can identify, provide:
- title: The song title
- artist: The artist/band name
- confidence: "high" if you can clearly read both title and artist, "medium" if partially visible, "low" if you're guessing

Return a JSON object with this exact format:
{
  "songs": [
    {"title": "Song Name", "artist": "Artist Name", "confidence": "high"}
  ],
  "error": null
}

If you cannot identify any songs, return:
{
  "songs": [],
  "error": "Description of why identification failed"
}

Be thorough - images may contain multiple songs (playlists, queue lists, etc.). Only include songs where you can identify at least the title.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this image and identify all songs visible. Extract song titles and artist names."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return res.json({
        success: false,
        songs: [],
        error: "No response from AI"
      });
    }

    const parsed = JSON.parse(content);

    if (parsed.error && parsed.songs.length === 0) {
      return res.json({
        success: false,
        songs: [],
        error: parsed.error,
        rawResponse: content
      });
    }

    const validSongs = parsed.songs.filter((song: DetectedSong) =>
      song.title && song.artist && song.confidence !== 'low'
    );

    res.json({
      success: validSongs.length > 0,
      songs: validSongs,
      rawResponse: content
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Song detection error:', errorMessage);
    res.status(500).json({
      success: false,
      songs: [],
      error: errorMessage
    });
  }
});

// YouTube OAuth API functions
async function refreshYouTubeToken(refreshToken: string): Promise<YouTubeTokens | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Token refresh failed:', errorData);
      return null;
    }

    const data = await response.json();
    const tokens: YouTubeTokens = {
      access_token: data.access_token,
      refresh_token: refreshToken,
      expires_at: Date.now() + (data.expires_in * 1000) - 60000,
    };

    saveYouTubeTokens(tokens);
    return tokens;
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

async function getYouTubeAccessToken(): Promise<string> {
  const tokens = loadYouTubeTokens();

  if (!tokens) {
    throw new Error('YouTube not connected. Please connect your YouTube account.');
  }

  if (Date.now() < tokens.expires_at) {
    return tokens.access_token;
  }

  const refreshed = await refreshYouTubeToken(tokens.refresh_token);
  if (!refreshed) {
    clearYouTubeTokens();
    throw new Error('YouTube session expired. Please reconnect your YouTube account.');
  }

  return refreshed.access_token;
}

async function youtubeFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const accessToken = await getYouTubeAccessToken();
  
  const url = `https://www.googleapis.com/youtube/v3${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearYouTubeTokens();
      throw new Error('YouTube session expired. Please reconnect your YouTube account.');
    }
    const errorText = await response.text();
    throw new Error(`YouTube API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

app.get('/api/youtube/playlists', async (req: Request, res: Response) => {
  try {
    const data = await youtubeFetch('/playlists?part=snippet,contentDetails&mine=true&maxResults=50');

    const playlists = (data.items || []).map((playlist: any) => ({
      id: playlist.id,
      name: playlist.snippet?.title || 'Untitled',
      itemCount: playlist.contentDetails?.itemCount ?? 0,
      imageUrl: playlist.snippet?.thumbnails?.medium?.url,
    }));

    res.json({ playlists });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load YouTube playlists';
    console.error('YouTube playlist error:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/youtube/search', async (req: Request, res: Response) => {
  try {
    const { title, artist } = req.query;

    if (!title || !artist) {
      return res.status(400).json({ error: 'title and artist are required' });
    }

    const query = encodeURIComponent(`${title} ${artist} official audio`);
    const data = await youtubeFetch(`/search?part=snippet&q=${query}&type=video&videoCategoryId=10&maxResults=5`);

    if (!data.items || data.items.length === 0) {
      return res.json({ result: null });
    }

    const video = data.items[0];
    res.json({
      result: {
        videoId: video.id.videoId,
        title: video.snippet.title,
        channelTitle: video.snippet.channelTitle,
        thumbnailUrl: video.snippet.thumbnails?.medium?.url,
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'YouTube search failed';
    console.error('YouTube search error:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/youtube/playlists/:id/videos', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const videoIds: string[] = [];

    let pageToken = '';
    while (true) {
      const tokenParam = pageToken ? `&pageToken=${pageToken}` : '';
      const data = await youtubeFetch(`/playlistItems?part=contentDetails&playlistId=${id}&maxResults=50${tokenParam}`);

      for (const item of data.items || []) {
        if (item.contentDetails?.videoId) {
          videoIds.push(item.contentDetails.videoId);
        }
      }

      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }

    res.json({ videoIds });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load playlist videos';
    console.error('YouTube videos error:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/youtube/playlists/:id/videos', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { videoId } = req.body;

    if (!videoId) {
      return res.status(400).json({ error: 'videoId is required' });
    }

    await youtubeFetch('/playlistItems?part=snippet', {
      method: 'POST',
      body: JSON.stringify({
        snippet: {
          playlistId: id,
          resourceId: {
            kind: 'youtube#video',
            videoId: videoId,
          },
        },
      }),
    });

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to add video to playlist';
    console.error('Add video error:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

// YouTube OAuth endpoints
app.get('/api/youtube/auth/status', (req: Request, res: Response) => {
  const tokens = loadYouTubeTokens();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  
  res.json({
    connected: !!tokens,
    hasCredentials: !!clientId && !!process.env.GOOGLE_CLIENT_SECRET,
    clientId: clientId || null,
  });
});

app.post('/api/youtube/auth/exchange', async (req: Request, res: Response) => {
  try {
    const { code, codeVerifier, redirectUri } = req.body;

    if (!code || !codeVerifier || !redirectUri) {
      return res.status(400).json({ error: 'code, codeVerifier, and redirectUri are required' });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'Google OAuth not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return res.status(400).json({ error: 'Failed to exchange authorization code' });
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.refresh_token) {
      return res.status(400).json({ 
        error: 'No refresh token received. Please revoke access at myaccount.google.com/permissions and try again.' 
      });
    }

    const tokens: YouTubeTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + (tokenData.expires_in * 1000) - 60000,
    };

    saveYouTubeTokens(tokens);

    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Token exchange failed';
    console.error('OAuth exchange error:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/youtube/auth/disconnect', (req: Request, res: Response) => {
  clearYouTubeTokens();
  res.json({ success: true });
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
});
