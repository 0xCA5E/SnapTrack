import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

const YOUTUBE_TOKENS_KEY = '@youtube_tokens';

WebBrowser.maybeCompleteAuthSession();

interface YouTubeTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

function getRedirectUri(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return 'http://localhost:5000';
  }
  
  return AuthSession.makeRedirectUri({
    scheme: 'songcapture',
  });
}

function getClientId(): string | null {
  return Constants.expoConfig?.extra?.googleClientId || 
         process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || 
         null;
}

export interface YouTubeAuthStatus {
  connected: boolean;
  hasCredentials: boolean;
  clientId: string | null;
}

async function loadTokens(): Promise<YouTubeTokens | null> {
  try {
    const data = await AsyncStorage.getItem(YOUTUBE_TOKENS_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load YouTube tokens:', error);
  }
  return null;
}

async function saveTokens(tokens: YouTubeTokens): Promise<void> {
  try {
    await AsyncStorage.setItem(YOUTUBE_TOKENS_KEY, JSON.stringify(tokens));
  } catch (error) {
    console.error('Failed to save YouTube tokens:', error);
  }
}

async function clearTokens(): Promise<void> {
  try {
    await AsyncStorage.removeItem(YOUTUBE_TOKENS_KEY);
  } catch (error) {
    console.error('Failed to clear YouTube tokens:', error);
  }
}

export async function getYouTubeAuthStatus(): Promise<YouTubeAuthStatus> {
  const tokens = await loadTokens();
  const clientId = getClientId();
  
  return {
    connected: !!tokens,
    hasCredentials: !!clientId,
    clientId,
  };
}

export async function initiateYouTubeOAuth(): Promise<{ success: boolean; error?: string }> {
  try {
    const clientId = getClientId();
    
    if (!clientId) {
      return { 
        success: false, 
        error: 'YouTube OAuth not configured. Please add EXPO_PUBLIC_GOOGLE_CLIENT_ID.' 
      };
    }

    const redirectUri = getRedirectUri();
    console.log('Using redirect URI:', redirectUri);

    const discovery = {
      authorizationEndpoint: GOOGLE_AUTH_ENDPOINT,
      tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
    };

    const useProxy = Platform.OS !== 'web' && Constants.appOwnership === 'expo';

    const authRequest = new AuthSession.AuthRequest({
      clientId,
      scopes: YOUTUBE_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    });

    await authRequest.makeAuthUrlAsync(discovery);
    
    const codeVerifier = authRequest.codeVerifier;
    if (!codeVerifier) {
      return { success: false, error: 'Failed to generate PKCE code verifier' };
    }

    const result = await authRequest.promptAsync(discovery, { 
      // @ts-ignore: useProxy is valid in some versions but types might be outdated
      useProxy 
    });

    if (result.type === 'success' && result.params.code) {
      const exchangeResult = await exchangeCodeForTokens(
        result.params.code,
        codeVerifier,
        redirectUri,
        clientId
      );
      return exchangeResult;
    } else if (result.type === 'cancel') {
      return { success: false, error: 'Authentication cancelled' };
    } else if (result.type === 'error') {
      return { success: false, error: result.params?.error_description || 'Authentication failed' };
    }

    return { success: false, error: 'Authentication failed' };
  } catch (error) {
    console.error('YouTube OAuth error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'OAuth failed' 
    };
  }
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        code: code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Token exchange failed:', errorData);
      return { success: false, error: 'Failed to exchange authorization code' };
    }

    const tokenData = await response.json();

    if (!tokenData.refresh_token) {
      return { 
        success: false, 
        error: 'No refresh token received. Please revoke access at myaccount.google.com/permissions and try again.' 
      };
    }

    const tokens: YouTubeTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + (tokenData.expires_in * 1000) - 60000,
    };

    await saveTokens(tokens);

    return { success: true };
  } catch (error) {
    console.error('Token exchange error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Token exchange failed' 
    };
  }
}

async function refreshAccessToken(refreshToken: string): Promise<YouTubeTokens | null> {
  const clientId = getClientId();
  
  if (!clientId) {
    console.error('Missing GOOGLE_CLIENT_ID for token refresh');
    return null;
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
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

    await saveTokens(tokens);
    return tokens;
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

export async function getYouTubeAccessToken(): Promise<string> {
  const tokens = await loadTokens();

  if (!tokens) {
    throw new Error('YouTube not connected. Please connect your YouTube account.');
  }

  if (Date.now() < tokens.expires_at) {
    return tokens.access_token;
  }

  const refreshed = await refreshAccessToken(tokens.refresh_token);
  if (!refreshed) {
    await clearTokens();
    throw new Error('YouTube session expired. Please reconnect your YouTube account.');
  }

  return refreshed.access_token;
}

export async function disconnectYouTube(): Promise<void> {
  await clearTokens();
}

export async function youtubeFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
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
      await clearTokens();
      throw new Error('YouTube session expired. Please reconnect your YouTube account.');
    }
    const errorText = await response.text();
    throw new Error(`YouTube API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

export async function getYouTubePlaylists(): Promise<Array<{
  id: string;
  name: string;
  itemCount: number;
  imageUrl?: string;
}>> {
  const data = await youtubeFetch('/playlists?part=snippet,contentDetails&mine=true&maxResults=50');

  return (data.items || []).map((playlist: any) => ({
    id: playlist.id,
    name: playlist.snippet?.title || 'Untitled',
    itemCount: playlist.contentDetails?.itemCount ?? 0,
    imageUrl: playlist.snippet?.thumbnails?.medium?.url,
  }));
}

export async function searchYouTubeVideo(title: string, artist: string): Promise<{
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl?: string;
} | null> {
  const query = encodeURIComponent(`${title} ${artist} official audio`);
  const data = await youtubeFetch(`/search?part=snippet&q=${query}&type=video&videoCategoryId=10&maxResults=5`);

  if (!data.items || data.items.length === 0) {
    return null;
  }

  const video = data.items[0];
  return {
    videoId: video.id.videoId,
    title: video.snippet.title,
    channelTitle: video.snippet.channelTitle,
    thumbnailUrl: video.snippet.thumbnails?.medium?.url,
  };
}

export async function getPlaylistVideoIds(playlistId: string): Promise<string[]> {
  const videoIds: string[] = [];

  let pageToken = '';
  while (true) {
    const tokenParam = pageToken ? `&pageToken=${pageToken}` : '';
    const data = await youtubeFetch(`/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=50${tokenParam}`);

    for (const item of data.items || []) {
      if (item.contentDetails?.videoId) {
        videoIds.push(item.contentDetails.videoId);
      }
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return videoIds;
}

export async function addVideoToPlaylist(playlistId: string, videoId: string): Promise<void> {
  await youtubeFetch('/playlistItems?part=snippet', {
    method: 'POST',
    body: JSON.stringify({
      snippet: {
        playlistId: playlistId,
        resourceId: {
          kind: 'youtube#video',
          videoId: videoId,
        },
      },
    }),
  });
}
