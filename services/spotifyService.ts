import Constants from 'expo-constants';

function getApiBaseUrl(): string {
  const debuggerHost = Constants.expoConfig?.hostUri;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:3001`;
  }
  return 'http://localhost:3001';
}

export interface PlaylistInfo {
  id: string;
  name: string;
  trackCount: number;
  imageUrl?: string;
}

export async function getUserPlaylists(): Promise<PlaylistInfo[]> {
  const apiUrl = getApiBaseUrl();
  const response = await fetch(`${apiUrl}/api/spotify/playlists`);
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to load playlists');
  }
  
  const data = await response.json();
  return data.playlists;
}

export async function getPlaylistTracks(playlistId: string): Promise<Set<string>> {
  const apiUrl = getApiBaseUrl();
  const response = await fetch(`${apiUrl}/api/spotify/playlists/${playlistId}/tracks`);
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to load tracks');
  }
  
  const data = await response.json();
  return new Set(data.trackIds);
}

export interface SongSearchResult {
  trackId: string;
  name: string;
  artist: string;
  album: string;
  imageUrl?: string;
}

export async function searchSong(title: string, artist: string): Promise<SongSearchResult | null> {
  const apiUrl = getApiBaseUrl();
  const params = new URLSearchParams({ title, artist });
  const response = await fetch(`${apiUrl}/api/spotify/search?${params}`);
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Search failed');
  }
  
  const data = await response.json();
  return data.result;
}

export async function addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<void> {
  const apiUrl = getApiBaseUrl();
  const response = await fetch(`${apiUrl}/api/spotify/playlists/${playlistId}/tracks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trackIds }),
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to add tracks');
  }
}
