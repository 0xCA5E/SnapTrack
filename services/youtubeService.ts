import {
  getYouTubePlaylists as getPlaylistsFromAuth,
  searchYouTubeVideo as searchVideoFromAuth,
  addVideoToPlaylist as addVideoFromAuth,
  getPlaylistVideoIds as getVideoIdsFromAuth,
} from './youtubeAuthService';

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
  return getPlaylistsFromAuth();
}

export async function searchYouTubeVideo(title: string, artist: string): Promise<YouTubeSearchResult | null> {
  return searchVideoFromAuth(title, artist);
}

export async function addVideoToPlaylist(playlistId: string, videoId: string): Promise<void> {
  return addVideoFromAuth(playlistId, videoId);
}

export async function getPlaylistVideoIds(playlistId: string): Promise<Set<string>> {
  const videoIds = await getVideoIdsFromAuth(playlistId);
  return new Set(videoIds);
}
