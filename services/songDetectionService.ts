import Constants from 'expo-constants';

export interface DetectedSong {
  title: string;
  artist: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface SongDetectionResult {
  success: boolean;
  songs: DetectedSong[];
  error?: string;
  rawResponse?: string;
}

function getApiBaseUrl(): string {
  const debuggerHost = Constants.expoConfig?.hostUri;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:3001`;
  }
  return 'http://localhost:3001';
}

export async function detectSongsFromImage(imageBase64: string): Promise<SongDetectionResult> {
  try {
    const apiUrl = getApiBaseUrl();
    
    const response = await fetch(`${apiUrl}/api/detect-songs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageBase64 }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        songs: [],
        error: `API error: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      songs: [],
      error: errorMessage,
    };
  }
}
