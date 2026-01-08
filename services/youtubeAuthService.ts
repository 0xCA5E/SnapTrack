import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

WebBrowser.maybeCompleteAuthSession();

function getApiBaseUrl(): string {
  const debuggerHost = Constants.expoConfig?.hostUri;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:3001`;
  }
  return 'http://localhost:3001';
}

function getRedirectUri(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return 'http://localhost:5000';
  }
  
  // For Expo Go on mobile
  return AuthSession.makeRedirectUri({
    scheme: 'songcapture',
  });
}

export interface YouTubeAuthStatus {
  connected: boolean;
  hasCredentials: boolean;
  clientId: string | null;
}

export async function getYouTubeAuthStatus(): Promise<YouTubeAuthStatus> {
  const apiUrl = getApiBaseUrl();
  const response = await fetch(`${apiUrl}/api/youtube/auth/status`);
  
  if (!response.ok) {
    throw new Error('Failed to get YouTube auth status');
  }
  
  return response.json();
}

export async function initiateYouTubeOAuth(): Promise<{ success: boolean; error?: string }> {
  try {
    const status = await getYouTubeAuthStatus();
    
    if (!status.hasCredentials || !status.clientId) {
      return { 
        success: false, 
        error: 'YouTube OAuth not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets.' 
      };
    }

    const redirectUri = getRedirectUri();
    console.log('Using redirect URI:', redirectUri);

    const codeVerifier = await generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    const discovery = {
      authorizationEndpoint: GOOGLE_AUTH_ENDPOINT,
      tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
    };

    // Use proxy for Expo Go to handle redirection through auth.expo.io
    const useProxy = Platform.OS !== 'web' && Constants.appOwnership === 'expo';

    const authRequest = new AuthSession.AuthRequest({
      clientId: status.clientId,
      scopes: YOUTUBE_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      codeChallenge,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
      extraParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    });

    const result = await authRequest.promptAsync(discovery, { 
      // @ts-ignore: useProxy is valid in some versions but types might be outdated
      useProxy 
    });

    if (result.type === 'success' && result.params.code) {
      const exchangeResult = await exchangeCodeForTokens(
        result.params.code,
        codeVerifier,
        redirectUri
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

async function generateCodeVerifier(): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  return base64URLEncode(randomBytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  return digest
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64URLEncode(buffer: Uint8Array): string {
  const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  
  for (let i = 0; i < buffer.length; i += 3) {
    const a = buffer[i];
    const b = buffer[i + 1] || 0;
    const c = buffer[i + 2] || 0;
    
    result += base64Chars[a >> 2];
    result += base64Chars[((a & 3) << 4) | (b >> 4)];
    
    if (i + 1 < buffer.length) {
      result += base64Chars[((b & 15) << 2) | (c >> 6)];
    }
    if (i + 2 < buffer.length) {
      result += base64Chars[c & 63];
    }
  }
  
  return result;
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{ success: boolean; error?: string }> {
  const apiUrl = getApiBaseUrl();
  
  const response = await fetch(`${apiUrl}/api/youtube/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      codeVerifier,
      redirectUri,
    }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    return { success: false, error: data.error || 'Token exchange failed' };
  }

  return { success: true };
}

export async function disconnectYouTube(): Promise<void> {
  const apiUrl = getApiBaseUrl();
  
  await fetch(`${apiUrl}/api/youtube/auth/disconnect`, {
    method: 'POST',
  });
}
