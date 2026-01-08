import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_STORAGE_KEY = 'SONG_QUEUE';

export type IntegrationPlatform = 'spotify' | 'youtube' | 'apple_music' | 'amazon_music';

export interface QueuedSong {
  id: string;
  title: string;
  artist: string;
  album?: string;
  imageUrl?: string;
  detectedAt: number;
  sourceImageUri?: string;
  syncStatus: {
    spotify?: { synced: boolean; trackId?: string; error?: string };
    youtube?: { synced: boolean; videoId?: string; error?: string };
    apple_music?: { synced: boolean; trackId?: string; error?: string };
    amazon_music?: { synced: boolean; trackId?: string; error?: string };
  };
}

export async function getSongQueue(): Promise<QueuedSong[]> {
  try {
    const data = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load song queue:', error);
    return [];
  }
}

export async function addSongsToQueue(songs: Omit<QueuedSong, 'id' | 'detectedAt' | 'syncStatus'>[]): Promise<QueuedSong[]> {
  const queue = await getSongQueue();
  
  const newSongs: QueuedSong[] = songs.map(song => ({
    ...song,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    detectedAt: Date.now(),
    syncStatus: {},
  }));
  
  const updatedQueue = [...queue, ...newSongs];
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updatedQueue));
  
  return newSongs;
}

export async function updateSongSyncStatus(
  songId: string,
  platform: IntegrationPlatform,
  status: { synced: boolean; trackId?: string; videoId?: string; error?: string }
): Promise<void> {
  const queue = await getSongQueue();
  const songIndex = queue.findIndex(s => s.id === songId);
  
  if (songIndex === -1) return;
  
  queue[songIndex].syncStatus[platform] = status;
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
}

export async function removeSongFromQueue(songId: string): Promise<void> {
  const queue = await getSongQueue();
  const filtered = queue.filter(s => s.id !== songId);
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(filtered));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify([]));
}

export async function getSongById(songId: string): Promise<QueuedSong | undefined> {
  const queue = await getSongQueue();
  return queue.find(s => s.id === songId);
}
