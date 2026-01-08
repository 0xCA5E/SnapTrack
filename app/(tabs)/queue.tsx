import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { 
  getSongQueue, 
  clearQueue, 
  removeSongFromQueue,
  updateSongSyncStatus,
  QueuedSong,
  IntegrationPlatform,
} from '@/services/songQueueService';
import {
  getIntegrations,
  IntegrationsState,
} from '@/services/integrationsService';
import { searchSong, addTracksToPlaylist, getPlaylistTracks } from '@/services/spotifyService';
import { searchYouTubeVideo, addVideoToPlaylist, getPlaylistVideoIds } from '@/services/youtubeService';

const PLATFORM_COLORS: Record<IntegrationPlatform, string> = {
  spotify: '#1DB954',
  youtube: '#FF0000',
  apple_music: '#FC3C44',
  amazon_music: '#00A8E1',
};

const PLATFORM_LABELS: Record<IntegrationPlatform, string> = {
  spotify: 'S',
  youtube: 'Y',
  apple_music: 'A',
  amazon_music: 'AM',
};

export default function QueueScreen() {
  const [queue, setQueue] = useState<QueuedSong[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [queueData, integrationsData] = await Promise.all([
        getSongQueue(),
        getIntegrations(),
      ]);
      setQueue(queueData);
      setIntegrations(integrationsData);
    } catch (error) {
      console.error('Failed to load queue:', error);
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

  const getConnectedPlatforms = (): IntegrationPlatform[] => {
    if (!integrations) return [];
    const platforms: IntegrationPlatform[] = [];
    if (integrations.spotify.connected && integrations.spotify.selectedPlaylistId) {
      platforms.push('spotify');
    }
    if (integrations.youtube.connected && integrations.youtube.selectedPlaylistId) {
      platforms.push('youtube');
    }
    return platforms;
  };

  const syncSongToPlatform = async (song: QueuedSong, platform: IntegrationPlatform) => {
    if (!integrations) return;
    
    try {
      if (platform === 'spotify') {
        const playlistId = integrations.spotify.selectedPlaylistId!;
        
        const existingTracks = await getPlaylistTracks(playlistId);
        const searchResult = await searchSong(song.title, song.artist);
        
        if (!searchResult) {
          await updateSongSyncStatus(song.id, platform, {
            synced: false,
            error: 'Song not found on Spotify',
          });
          return;
        }

        if (existingTracks.has(searchResult.trackId)) {
          await updateSongSyncStatus(song.id, platform, {
            synced: true,
            trackId: searchResult.trackId,
          });
          return;
        }

        await addTracksToPlaylist(playlistId, [searchResult.trackId]);
        await updateSongSyncStatus(song.id, platform, {
          synced: true,
          trackId: searchResult.trackId,
        });
      } else if (platform === 'youtube') {
        const playlistId = integrations.youtube.selectedPlaylistId!;
        
        const existingVideos = await getPlaylistVideoIds(playlistId);
        const searchResult = await searchYouTubeVideo(song.title, song.artist);
        
        if (!searchResult) {
          await updateSongSyncStatus(song.id, platform, {
            synced: false,
            error: 'Video not found on YouTube',
          });
          return;
        }

        if (existingVideos.has(searchResult.videoId)) {
          await updateSongSyncStatus(song.id, platform, {
            synced: true,
            videoId: searchResult.videoId,
          });
          return;
        }

        await addVideoToPlaylist(playlistId, searchResult.videoId);
        await updateSongSyncStatus(song.id, platform, {
          synced: true,
          videoId: searchResult.videoId,
        });
      }
    } catch (error) {
      await updateSongSyncStatus(song.id, platform, {
        synced: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      });
    }
  };

  const syncAllSongs = async () => {
    const platforms = getConnectedPlatforms();
    if (platforms.length === 0) {
      Alert.alert('No Integrations', 'Please configure and select playlists in the Integrations tab first.');
      return;
    }

    setSyncing(true);
    
    for (const song of queue) {
      if (syncing === false) break; // Allow stopping sync if needed (future proofing)
      for (const platform of platforms) {
        if (!song.syncStatus[platform]?.synced) {
          try {
            await syncSongToPlatform(song, platform);
          } catch (e) {
            console.error(`Failed to sync ${song.title} to ${platform}:`, e);
          }
        }
      }
    }
    
    await loadData();
    setSyncing(false);
    Alert.alert('Sync Complete', 'All songs have been synced to your connected platforms.');
  };

  const syncSingleSong = async (song: QueuedSong) => {
    const platforms = getConnectedPlatforms();
    if (platforms.length === 0) {
      Alert.alert('No Integrations', 'Please configure and select playlists in the Integrations tab first.');
      return;
    }

    setSyncing(true);
    for (const platform of platforms) {
      if (!song.syncStatus[platform]?.synced) {
        await syncSongToPlatform(song, platform);
      }
    }
    await loadData();
    setSyncing(false);
  };

  const handleClearQueue = () => {
    Alert.alert(
      'Clear Queue',
      'This will remove all songs from your local queue. Songs already synced to playlists will remain there.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearQueue();
            setQueue([]);
          },
        },
      ]
    );
  };

  const handleRemoveSong = (song: QueuedSong) => {
    Alert.alert(
      'Remove Song',
      `Remove "${song.title}" from the queue? It will remain in any playlists it was synced to.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeSongFromQueue(song.id);
            setQueue(q => q.filter(s => s.id !== song.id));
          },
        },
      ]
    );
  };

  const renderSyncBadges = (song: QueuedSong) => {
    const platforms: IntegrationPlatform[] = ['spotify', 'youtube', 'apple_music', 'amazon_music'];
    
    return (
      <View style={styles.badgeContainer}>
        {platforms.map(platform => {
          const status = song.syncStatus[platform];
          const isAvailable = integrations?.[platform]?.available;
          
          if (!isAvailable) return null;
          
          return (
            <View
              key={platform}
              style={[
                styles.badge,
                {
                  backgroundColor: status?.synced
                    ? PLATFORM_COLORS[platform]
                    : status?.error
                    ? '#FF6B6B'
                    : '#555',
                },
              ]}>
              <Text style={styles.badgeText}>{PLATFORM_LABELS[platform]}</Text>
            </View>
          );
        })}
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
      <Text style={styles.title}>Song Queue</Text>
      <Text style={styles.subtitle}>
        {queue.length} song{queue.length !== 1 ? 's' : ''} waiting to sync
      </Text>

      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Sync Status:</Text>
        <View style={styles.legendItems}>
          <View style={styles.legendItem}>
            <View style={[styles.legendBadge, { backgroundColor: '#1DB954' }]} />
            <Text style={styles.legendText}>Spotify</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBadge, { backgroundColor: '#FF0000' }]} />
            <Text style={styles.legendText}>YouTube</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBadge, { backgroundColor: '#555' }]} />
            <Text style={styles.legendText}>Not synced</Text>
          </View>
        </View>
      </View>

      {queue.length > 0 && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
            onPress={syncAllSongs}
            disabled={syncing}>
            {syncing ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.syncButtonText}>Sync All to Playlists</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearQueue}
            disabled={syncing}>
            <Text style={styles.clearButtonText}>Clear Queue</Text>
          </TouchableOpacity>
        </View>
      )}

      {queue.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No songs in queue</Text>
          <Text style={styles.emptyText}>
            Capture photos with song information to add them to your queue.
          </Text>
        </View>
      ) : (
        queue.map(song => (
          <TouchableOpacity
            key={song.id}
            style={styles.songCard}
            onPress={() => syncSingleSong(song)}
            onLongPress={() => handleRemoveSong(song)}>
            {song.imageUrl ? (
              <Image source={{ uri: song.imageUrl }} style={styles.albumArt} />
            ) : (
              <View style={styles.albumPlaceholder}>
                <Text style={styles.albumPlaceholderText}>?</Text>
              </View>
            )}
            <View style={styles.songInfo}>
              <Text style={styles.songTitle} numberOfLines={1}>
                {song.title}
              </Text>
              <Text style={styles.songArtist} numberOfLines={1}>
                {song.artist}
              </Text>
              {song.album && (
                <Text style={styles.songAlbum} numberOfLines={1}>
                  {song.album}
                </Text>
              )}
            </View>
            {renderSyncBadges(song)}
          </TouchableOpacity>
        ))
      )}
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
    marginBottom: 16,
  },
  legend: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  legendTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  legendItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendBadge: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendText: {
    color: '#b3b3b3',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  syncButton: {
    flex: 1,
    backgroundColor: '#1DB954',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 16,
  },
  clearButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#555',
  },
  clearButtonText: {
    color: '#b3b3b3',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#b3b3b3',
    textAlign: 'center',
  },
  songCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  albumArt: {
    width: 50,
    height: 50,
    borderRadius: 4,
  },
  albumPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 4,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  albumPlaceholderText: {
    color: '#666',
    fontSize: 20,
  },
  songInfo: {
    flex: 1,
    marginLeft: 12,
  },
  songTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  songArtist: {
    color: '#b3b3b3',
    fontSize: 14,
    marginTop: 2,
  },
  songAlbum: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  badgeContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
