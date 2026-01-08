import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Modal,
  FlatList,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getIntegrations,
  refreshAllConnections,
  setSelectedPlaylist,
  disconnectIntegration,
  IntegrationsState,
  IntegrationPlatform,
} from '@/services/integrationsService';
import { getUserPlaylists, PlaylistInfo } from '@/services/spotifyService';
import { getYouTubePlaylists, YouTubePlaylistInfo } from '@/services/youtubeService';
import { 
  initiateYouTubeOAuth, 
  disconnectYouTube,
  getYouTubeAuthStatus,
} from '@/services/youtubeAuthService';

const PLATFORM_ICONS: Record<IntegrationPlatform, { color: string; letter: string }> = {
  spotify: { color: '#1DB954', letter: 'S' },
  youtube: { color: '#FF0000', letter: 'Y' },
  apple_music: { color: '#FC3C44', letter: 'A' },
  amazon_music: { color: '#00A8E1', letter: 'AM' },
};

export default function IntegrationsScreen() {
  const [integrations, setIntegrations] = useState<IntegrationsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState<IntegrationPlatform | null>(null);
  const [youtubeAuthStatus, setYoutubeAuthStatus] = useState<{ hasCredentials: boolean } | null>(null);
  const [playlistModal, setPlaylistModal] = useState<{
    visible: boolean;
    platform: IntegrationPlatform | null;
    playlists: any[];
    loading: boolean;
  }>({
    visible: false,
    platform: null,
    playlists: [],
    loading: false,
  });

  const loadData = async () => {
    try {
      const [data, authStatus] = await Promise.all([
        refreshAllConnections(),
        getYouTubeAuthStatus().catch(() => ({ hasCredentials: false })),
      ]);
      setIntegrations(data);
      setYoutubeAuthStatus(authStatus);
    } catch (error) {
      console.error('Failed to load integrations:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleConnectYouTube = async () => {
    setConnecting('youtube');
    try {
      const result = await initiateYouTubeOAuth();
      if (result.success) {
        await loadData();
      } else if (result.error) {
        Alert.alert('Connection Failed', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to connect YouTube');
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnectYouTube = () => {
    Alert.alert(
      'Disconnect YouTube',
      'Are you sure you want to disconnect your YouTube account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await disconnectYouTube();
            await disconnectIntegration('youtube');
            await loadData();
          },
        },
      ]
    );
  };

  const openPlaylistSelector = async (platform: IntegrationPlatform) => {
    if (!integrations?.[platform].connected) return;

    setPlaylistModal({
      visible: true,
      platform,
      playlists: [],
      loading: true,
    });

    try {
      let playlists: any[] = [];
      if (platform === 'spotify') {
        playlists = await getUserPlaylists();
      } else if (platform === 'youtube') {
        playlists = await getYouTubePlaylists();
      }
      setPlaylistModal(prev => ({
        ...prev,
        playlists,
        loading: false,
      }));
    } catch (error) {
      console.error('Failed to load playlists:', error);
      setPlaylistModal(prev => ({
        ...prev,
        loading: false,
      }));
    }
  };

  const selectPlaylist = async (playlist: any) => {
    if (!playlistModal.platform) return;

    await setSelectedPlaylist(
      playlistModal.platform,
      playlist.id,
      playlist.name
    );

    setPlaylistModal({ visible: false, platform: null, playlists: [], loading: false });
    loadData();
  };

  const renderIntegrationCard = (platform: IntegrationPlatform) => {
    if (!integrations) return null;
    
    const config = integrations[platform];
    const icon = PLATFORM_ICONS[platform];
    const isUnavailable = !config.available;
    const isConnecting = connecting === platform;
    const showConnectButton = platform === 'youtube' && !config.connected && youtubeAuthStatus?.hasCredentials;
    const showDisconnectButton = platform === 'youtube' && config.connected;

    return (
      <View key={platform} style={[styles.card, isUnavailable && styles.cardDisabled]}>
        <TouchableOpacity
          style={styles.cardTouchable}
          onPress={() => openPlaylistSelector(platform)}
          disabled={isUnavailable || !config.connected}>
          <View style={[styles.iconContainer, { backgroundColor: isUnavailable ? '#333' : icon.color }]}>
            <Text style={styles.iconText}>{icon.letter}</Text>
          </View>
          
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, isUnavailable && styles.textDisabled]}>
                {config.name}
              </Text>
              <View style={[
                styles.statusBadge,
                config.connected ? styles.statusConnected : styles.statusDisconnected,
                isUnavailable && styles.statusUnavailable,
              ]}>
                <Text style={styles.statusText}>
                  {isUnavailable ? 'Coming Soon' : config.connected ? 'Connected' : 'Not Connected'}
                </Text>
              </View>
            </View>
            
            <Text style={[styles.cardDescription, isUnavailable && styles.textDisabled]}>
              {config.description}
            </Text>
            
            {config.connected && config.selectedPlaylistName && (
              <View style={styles.playlistInfo}>
                <Text style={styles.playlistLabel}>Syncing to:</Text>
                <Text style={styles.playlistName}>{config.selectedPlaylistName}</Text>
              </View>
            )}
            
            {config.connected && !config.selectedPlaylistName && (
              <Text style={styles.selectPrompt}>Tap to select a playlist</Text>
            )}
            
            {config.error && !isUnavailable && (
              <Text style={styles.errorText}>{config.error}</Text>
            )}
          </View>
        </TouchableOpacity>
        
        {showConnectButton && (
          <TouchableOpacity
            style={styles.connectButton}
            onPress={handleConnectYouTube}
            disabled={isConnecting}>
            {isConnecting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.connectButtonText}>Connect</Text>
            )}
          </TouchableOpacity>
        )}
        
        {showDisconnectButton && (
          <TouchableOpacity
            style={styles.disconnectButton}
            onPress={handleDisconnectYouTube}>
            <Text style={styles.disconnectButtonText}>Disconnect</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1DB954" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#1DB954"
        />
      }>
      <Text style={styles.title}>Integrations</Text>
      <Text style={styles.subtitle}>
        Connect your music platforms and select target playlists
      </Text>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>How it works</Text>
        <Text style={styles.infoText}>
          1. Connect to a music platform{'\n'}
          2. Select a target playlist for each platform{'\n'}
          3. Captured songs will sync to all selected playlists
        </Text>
      </View>

      {renderIntegrationCard('spotify')}
      {renderIntegrationCard('youtube')}
      {renderIntegrationCard('apple_music')}
      {renderIntegrationCard('amazon_music')}

      <Modal
        visible={playlistModal.visible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPlaylistModal({ visible: false, platform: null, playlists: [], loading: false })}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Select {playlistModal.platform === 'spotify' ? 'Spotify' : 'YouTube'} Playlist
            </Text>
            
            {playlistModal.loading ? (
              <ActivityIndicator size="large" color="#1DB954" style={styles.modalLoader} />
            ) : (
              <FlatList
                data={playlistModal.playlists}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.playlistItem}
                    onPress={() => selectPlaylist(item)}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.playlistImage} />
                    ) : (
                      <View style={styles.playlistImagePlaceholder}>
                        <Text style={styles.playlistImagePlaceholderText}>?</Text>
                      </View>
                    )}
                    <View style={styles.playlistItemInfo}>
                      <Text style={styles.playlistItemName}>{item.name}</Text>
                      <Text style={styles.playlistItemCount}>
                        {item.trackCount || item.itemCount || 0} songs
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                style={styles.playlistList}
              />
            )}
            
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setPlaylistModal({ visible: false, platform: null, playlists: [], loading: false })}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 40,
  },
  subtitle: {
    fontSize: 14,
    color: '#b3b3b3',
    marginTop: 4,
    marginBottom: 20,
  },
  infoBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  infoTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    color: '#b3b3b3',
    fontSize: 13,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTouchable: {
    flexDirection: 'row',
  },
  cardDisabled: {
    opacity: 0.5,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  cardContent: {
    flex: 1,
    marginLeft: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  textDisabled: {
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusConnected: {
    backgroundColor: 'rgba(29, 185, 84, 0.2)',
  },
  statusDisconnected: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
  },
  statusUnavailable: {
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#b3b3b3',
  },
  cardDescription: {
    color: '#b3b3b3',
    fontSize: 13,
    marginTop: 4,
  },
  playlistInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(29, 185, 84, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  playlistLabel: {
    color: '#1DB954',
    fontSize: 11,
    marginRight: 4,
  },
  playlistName: {
    color: '#1DB954',
    fontSize: 11,
    fontWeight: '600',
  },
  selectPrompt: {
    color: '#1DB954',
    fontSize: 12,
    marginTop: 8,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 12,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalLoader: {
    marginVertical: 40,
  },
  playlistList: {
    maxHeight: 400,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#282828',
  },
  playlistImage: {
    width: 50,
    height: 50,
    borderRadius: 4,
  },
  playlistImagePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 4,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistImagePlaceholderText: {
    color: '#666',
    fontSize: 20,
  },
  playlistItemInfo: {
    marginLeft: 12,
    flex: 1,
  },
  playlistItemName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  playlistItemCount: {
    color: '#b3b3b3',
    fontSize: 13,
    marginTop: 2,
  },
  modalCloseButton: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#282828',
  },
  modalCloseText: {
    color: '#b3b3b3',
    fontSize: 16,
    fontWeight: '500',
  },
  connectButton: {
    marginTop: 12,
    backgroundColor: '#FF0000',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  disconnectButton: {
    marginTop: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  disconnectButtonText: {
    color: '#999',
    fontSize: 13,
    fontWeight: '500',
  },
});
