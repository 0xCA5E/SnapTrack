import AsyncStorage from '@react-native-async-storage/async-storage';
import { detectSongsFromImage, DetectedSong } from './songDetectionService';
import { searchSong, addTracksToPlaylist, getPlaylistTracks, SongSearchResult } from './spotifyService';

export interface ImageProcessingResult {
  imageUri: string;
  status: 'success' | 'partial' | 'failed';
  songsFound: number;
  songsAdded: number;
  songsDuplicate: number;
  songsFailed: number;
  songs: ProcessedSong[];
  error?: string;
}

export interface ProcessedSong {
  title: string;
  artist: string;
  status: 'added' | 'duplicate' | 'not_found' | 'error';
  spotifyResult?: SongSearchResult;
  error?: string;
}

export interface FlaggedImage {
  id: string;
  imageUri: string;
  error: string;
  timestamp: number;
}

const FLAGGED_IMAGES_KEY = 'flagged_images';
const PROCESSING_QUEUE_KEY = 'processing_queue';

export async function getFlaggedImages(): Promise<FlaggedImage[]> {
  try {
    const data = await AsyncStorage.getItem(FLAGGED_IMAGES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addFlaggedImage(imageUri: string, error: string): Promise<void> {
  const flagged = await getFlaggedImages();
  flagged.push({
    id: Date.now().toString(),
    imageUri,
    error,
    timestamp: Date.now(),
  });
  await AsyncStorage.setItem(FLAGGED_IMAGES_KEY, JSON.stringify(flagged));
}

export async function removeFlaggedImage(id: string): Promise<void> {
  const flagged = await getFlaggedImages();
  const filtered = flagged.filter(img => img.id !== id);
  await AsyncStorage.setItem(FLAGGED_IMAGES_KEY, JSON.stringify(filtered));
}

export async function clearFlaggedImages(): Promise<void> {
  await AsyncStorage.removeItem(FLAGGED_IMAGES_KEY);
}

export interface ProcessingProgress {
  currentImage: number;
  totalImages: number;
  currentImageUri: string;
  status: string;
  results: ImageProcessingResult[];
}

export type ProgressCallback = (progress: ProcessingProgress) => void;

export async function processImages(
  imageUris: string[],
  playlistId: string,
  onProgress?: ProgressCallback
): Promise<ImageProcessingResult[]> {
  const results: ImageProcessingResult[] = [];
  
  const existingTrackIds = await getPlaylistTracks(playlistId);
  
  for (let i = 0; i < imageUris.length; i++) {
    const imageUri = imageUris[i];
    
    onProgress?.({
      currentImage: i + 1,
      totalImages: imageUris.length,
      currentImageUri: imageUri,
      status: 'Analyzing image...',
      results: [...results],
    });

    try {
      const base64 = await imageUriToBase64(imageUri);
      
      onProgress?.({
        currentImage: i + 1,
        totalImages: imageUris.length,
        currentImageUri: imageUri,
        status: 'Detecting songs...',
        results: [...results],
      });

      const detectionResult = await detectSongsFromImage(base64);
      
      if (!detectionResult.success || detectionResult.songs.length === 0) {
        await addFlaggedImage(imageUri, detectionResult.error || 'No songs detected');
        results.push({
          imageUri,
          status: 'failed',
          songsFound: 0,
          songsAdded: 0,
          songsDuplicate: 0,
          songsFailed: 0,
          songs: [],
          error: detectionResult.error || 'No songs detected',
        });
        continue;
      }

      const processedSongs: ProcessedSong[] = [];
      const tracksToAdd: string[] = [];

      for (const song of detectionResult.songs) {
        onProgress?.({
          currentImage: i + 1,
          totalImages: imageUris.length,
          currentImageUri: imageUri,
          status: `Searching for "${song.title}" by ${song.artist}...`,
          results: [...results],
        });

        try {
          const spotifyResult = await searchSong(song.title, song.artist);
          
          if (!spotifyResult) {
            processedSongs.push({
              title: song.title,
              artist: song.artist,
              status: 'not_found',
            });
            continue;
          }

          if (existingTrackIds.has(spotifyResult.trackId)) {
            processedSongs.push({
              title: song.title,
              artist: song.artist,
              status: 'duplicate',
              spotifyResult,
            });
            continue;
          }

          tracksToAdd.push(spotifyResult.trackId);
          existingTrackIds.add(spotifyResult.trackId);
          processedSongs.push({
            title: song.title,
            artist: song.artist,
            status: 'added',
            spotifyResult,
          });
        } catch (error) {
          processedSongs.push({
            title: song.title,
            artist: song.artist,
            status: 'error',
            error: error instanceof Error ? error.message : 'Search failed',
          });
        }
      }

      if (tracksToAdd.length > 0) {
        onProgress?.({
          currentImage: i + 1,
          totalImages: imageUris.length,
          currentImageUri: imageUri,
          status: `Adding ${tracksToAdd.length} song(s) to playlist...`,
          results: [...results],
        });

        await addTracksToPlaylist(playlistId, tracksToAdd);
      }

      const added = processedSongs.filter(s => s.status === 'added').length;
      const duplicates = processedSongs.filter(s => s.status === 'duplicate').length;
      const failed = processedSongs.filter(s => s.status === 'not_found' || s.status === 'error').length;

      let status: 'success' | 'partial' | 'failed' = 'success';
      if (added === 0 && (failed > 0 || duplicates === processedSongs.length)) {
        status = duplicates > 0 ? 'partial' : 'failed';
      } else if (failed > 0) {
        status = 'partial';
      }

      if (status === 'failed') {
        await addFlaggedImage(imageUri, 'No songs could be added to playlist');
      }

      results.push({
        imageUri,
        status,
        songsFound: detectionResult.songs.length,
        songsAdded: added,
        songsDuplicate: duplicates,
        songsFailed: failed,
        songs: processedSongs,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Processing failed';
      await addFlaggedImage(imageUri, errorMessage);
      results.push({
        imageUri,
        status: 'failed',
        songsFound: 0,
        songsAdded: 0,
        songsDuplicate: 0,
        songsFailed: 0,
        songs: [],
        error: errorMessage,
      });
    }
  }

  onProgress?.({
    currentImage: imageUris.length,
    totalImages: imageUris.length,
    currentImageUri: '',
    status: 'Complete',
    results,
  });

  return results;
}

async function imageUriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
