import express, { Request, Response } from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
const PORT = parseInt(process.env.API_PORT || '3001', 10);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

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

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
});
