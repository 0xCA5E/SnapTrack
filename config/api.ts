import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function getApiBaseUrl(): string {
  const replitDomain = process.env.EXPO_PUBLIC_REPLIT_DOMAIN;
  
  if (Platform.OS === 'web') {
    const debuggerHost = Constants.expoConfig?.hostUri;
    if (debuggerHost) {
      const host = debuggerHost.split(':')[0];
      return `http://${host}:3001`;
    }
    return 'http://localhost:3001';
  }

  if (replitDomain) {
    return `https://${replitDomain}:3001`;
  }

  const debuggerHost = Constants.expoConfig?.hostUri;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:3001`;
  }

  return 'http://localhost:3001';
}
