import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getFlaggedImages, removeFlaggedImage, clearFlaggedImages, FlaggedImage } from '@/services/processingService';

export default function FlaggedScreen() {
  const [flaggedImages, setFlaggedImages] = useState<FlaggedImage[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadFlaggedImages = useCallback(async () => {
    const images = await getFlaggedImages();
    setFlaggedImages(images);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFlaggedImages();
    }, [loadFlaggedImages])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFlaggedImages();
  }, [loadFlaggedImages]);

  const handleRemove = async (id: string) => {
    await removeFlaggedImage(id);
    setFlaggedImages(prev => prev.filter(img => img.id !== id));
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Flagged Images',
      'Are you sure you want to remove all flagged images? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearFlaggedImages();
            setFlaggedImages([]);
          },
        },
      ]
    );
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1DB954" />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Flagged Images</Text>
            <Text style={styles.subtitle}>Images that couldn't be processed</Text>
          </View>
          {flaggedImages.length > 0 && (
            <TouchableOpacity onPress={handleClearAll}>
              <Text style={styles.clearAllText}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>

        {flaggedImages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>OK</Text>
            <Text style={styles.emptyTitle}>No Flagged Images</Text>
            <Text style={styles.emptyText}>
              Images that fail to process will appear here for you to review.
            </Text>
          </View>
        ) : (
          flaggedImages.map((image) => (
            <View key={image.id} style={styles.flaggedCard}>
              <Image source={{ uri: image.imageUri }} style={styles.flaggedImage} />
              <View style={styles.flaggedInfo}>
                <Text style={styles.flaggedDate}>{formatDate(image.timestamp)}</Text>
                <Text style={styles.flaggedError} numberOfLines={3}>{image.error}</Text>
                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={() => handleRemove(image.id)}
                >
                  <Text style={styles.dismissButtonText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#b3b3b3',
  },
  clearAllText: {
    color: '#ff4444',
    fontWeight: '600',
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 32,
    color: '#1DB954',
    marginBottom: 16,
    fontWeight: 'bold',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#b3b3b3',
    textAlign: 'center',
    maxWidth: 280,
  },
  flaggedCard: {
    backgroundColor: '#282828',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    flexDirection: 'row',
  },
  flaggedImage: {
    width: 100,
    height: 100,
  },
  flaggedInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  flaggedDate: {
    fontSize: 12,
    color: '#b3b3b3',
    marginBottom: 4,
  },
  flaggedError: {
    fontSize: 13,
    color: '#ff4444',
    flex: 1,
  },
  dismissButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#404040',
    borderRadius: 4,
    marginTop: 8,
  },
  dismissButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
