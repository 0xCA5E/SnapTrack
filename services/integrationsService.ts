import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from '../config/api';
import { getYouTubeAuthStatus, getYouTubePlaylists } from './youtubeAuthService';

const INTEGRATIONS_STORAGE_KEY = 'INTEGRATIONS_STATUS';

export type IntegrationPlatform = 'spotify' | 'youtube' | 'apple_music' | 'amazon_music';

export interface IntegrationConfig {
  platform: IntegrationPlatform;
  name: string;
  description: string;
  connected: boolean;
  available: boolean;
  selectedPlaylistId?: string;
  selectedPlaylistName?: string;
  lastSyncAt?: number;
  error?: string;
}

export interface IntegrationsState {
  spotify: IntegrationConfig;
  youtube: IntegrationConfig;
  apple_music: IntegrationConfig;
  amazon_music: IntegrationConfig;
}

const DEFAULT_INTEGRATIONS: IntegrationsState = {
  spotify: {
    platform: 'spotify',
    name: 'Spotify',
    description: 'Stream and save to Spotify playlists',
    connected: false,
    available: true,
  },
  youtube: {
    platform: 'youtube',
    name: 'YouTube Music',
    description: 'Save to YouTube playlists',
    connected: false,
    available: true,
  },
  apple_music: {
    platform: 'apple_music',
    name: 'Apple Music',
    description: 'Coming soon',
    connected: false,
    available: false,
  },
  amazon_music: {
    platform: 'amazon_music',
    name: 'Amazon Music',
    description: 'Coming soon',
    connected: false,
    available: false,
  },
};

export async function getIntegrations(): Promise<IntegrationsState> {
  try {
    const data = await AsyncStorage.getItem(INTEGRATIONS_STORAGE_KEY);
    if (!data) return DEFAULT_INTEGRATIONS;
    
    const stored = JSON.parse(data);
    return { ...DEFAULT_INTEGRATIONS, ...stored };
  } catch (error) {
    console.error('Failed to load integrations:', error);
    return DEFAULT_INTEGRATIONS;
  }
}

export async function updateIntegration(
  platform: IntegrationPlatform,
  updates: Partial<IntegrationConfig>
): Promise<void> {
  const integrations = await getIntegrations();
  integrations[platform] = { ...integrations[platform], ...updates };
  await AsyncStorage.setItem(INTEGRATIONS_STORAGE_KEY, JSON.stringify(integrations));
}

export async function checkSpotifyConnection(): Promise<boolean> {
  try {
    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}/api/spotify/playlists`);
    
    if (response.ok) {
      await updateIntegration('spotify', { connected: true, error: undefined });
      return true;
    }
    
    const data = await response.json();
    await updateIntegration('spotify', { connected: false, error: data.error });
    return false;
  } catch (error) {
    await updateIntegration('spotify', { 
      connected: false, 
      error: error instanceof Error ? error.message : 'Connection failed' 
    });
    return false;
  }
}

export async function checkYouTubeConnection(): Promise<boolean> {
  try {
    const authStatus = await getYouTubeAuthStatus();
    
    if (!authStatus.hasCredentials) {
      await updateIntegration('youtube', { 
        connected: false, 
        error: 'YouTube not configured. Add EXPO_PUBLIC_GOOGLE_CLIENT_ID.' 
      });
      return false;
    }
    
    if (!authStatus.connected) {
      await updateIntegration('youtube', { 
        connected: false, 
        error: undefined 
      });
      return false;
    }
    
    try {
      await getYouTubePlaylists();
      await updateIntegration('youtube', { connected: true, error: undefined });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      await updateIntegration('youtube', { connected: false, error: errorMessage });
      return false;
    }
  } catch (error) {
    await updateIntegration('youtube', { 
      connected: false, 
      error: error instanceof Error ? error.message : 'Connection failed' 
    });
    return false;
  }
}

export async function refreshAllConnections(): Promise<IntegrationsState> {
  await Promise.all([
    checkSpotifyConnection(),
    checkYouTubeConnection(),
  ]);
  
  return getIntegrations();
}

export async function setSelectedPlaylist(
  platform: IntegrationPlatform,
  playlistId: string,
  playlistName: string
): Promise<void> {
  await updateIntegration(platform, {
    selectedPlaylistId: playlistId,
    selectedPlaylistName: playlistName,
  });
}

export async function disconnectIntegration(platform: IntegrationPlatform): Promise<void> {
  await updateIntegration(platform, {
    connected: false,
    selectedPlaylistId: undefined,
    selectedPlaylistName: undefined,
    error: undefined,
  });
}
