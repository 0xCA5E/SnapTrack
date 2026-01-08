import { getApiBaseUrl } from '../config/api';

export interface YouTubePlaylistInfo {
  id: string;
  name: string;
  itemCount: number;
  imageUrl?: string;
}

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl?: string;
}

export async function getYouTubePlaylists(): Promise<YouTubePlaylistInfo[]> {
  const apiUrl = getApiBaseUrl();
  const response = await fetch(`${apiUrl}/api/youtube/playlists`);
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to load YouTube playlists');
  }
  
  const data = await response.json();
  return data.playlists;
}

export async function searchYouTubeVideo(title: string, artist: string): Promise<YouTubeSearchResult | null> {
  const apiUrl = getApiBaseUrl();
  const params = new URLSearchParams({ title, artist });
  const response = await fetch(`${apiUrl}/api/youtube/search?${params}`);
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'YouTube search failed');
  }
  
  const data = await response.json();
  return data.result;
}

export async function addVideoToPlaylist(playlistId: string, videoId: string): Promise<void> {
  const apiUrl = getApiBaseUrl();
  const response = await fetch(`${apiUrl}/api/youtube/playlists/${playlistId}/videos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ videoId }),
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to add video to playlist');
  }
}

export async function getPlaylistVideoIds(playlistId: string): Promise<Set<string>> {
  const apiUrl = getApiBaseUrl();
  const response = await fetch(`${apiUrl}/api/youtube/playlists/${playlistId}/videos`);
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to load playlist videos');
  }
  
  const data = await response.json();
  return new Set(data.videoIds);
}
