import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { detectSongsFromImage, DetectedSong } from '@/services/songDetectionService';
import { addSongsToQueue, QueuedSong } from '@/services/songQueueService';
import { addFlaggedImage } from '@/services/processingService';

type AppState = 'idle' | 'selecting' | 'processing' | 'complete';

interface ProcessingResult {
  imageUri: string;
  songs: DetectedSong[];
  error?: string;
}

export default function HomeScreen() {
  const [state, setState] = useState<AppState>('idle');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [addedSongs, setAddedSongs] = useState<QueuedSong[]>([]);

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      const { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photos to use this feature.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setSelectedImages(result.assets.map(asset => asset.uri));
      setState('selecting');
    }
  };

  const removeImage = (uri: string) => {
    const newImages = selectedImages.filter(img => img !== uri);
    setSelectedImages(newImages);
    if (newImages.length === 0) {
      setState('idle');
    }
  };

  const startProcessing = async () => {
    if (selectedImages.length === 0) return;

    setState('processing');
    setProgress({ current: 0, total: selectedImages.length, status: 'Starting...' });
    setResults([]);
    setAddedSongs([]);

    const processingResults: ProcessingResult[] = [];
    const songsToAdd: Omit<QueuedSong, 'id' | 'detectedAt' | 'syncStatus'>[] = [];

    for (let i = 0; i < selectedImages.length; i++) {
      const imageUri = selectedImages[i];
      setProgress({
        current: i + 1,
        total: selectedImages.length,
        status: `Analyzing image ${i + 1}...`,
      });

      try {
        const detection = await detectSongsFromImage(imageUri);

        if (detection.success && detection.songs.length > 0) {
          processingResults.push({
            imageUri,
            songs: detection.songs,
          });

          for (const song of detection.songs) {
            songsToAdd.push({
              title: song.title,
              artist: song.artist,
              sourceImageUri: imageUri,
            });
          }
        } else {
          processingResults.push({
            imageUri,
            songs: [],
            error: detection.error || 'No songs detected',
          });

          await addFlaggedImage(imageUri, detection.error || 'No songs detected');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Detection failed';
        processingResults.push({
          imageUri,
          songs: [],
          error: errorMessage,
        });
        
        await addFlaggedImage(imageUri, errorMessage);
      }
    }

    setResults(processingResults);

    if (songsToAdd.length > 0) {
      const added = await addSongsToQueue(songsToAdd);
      setAddedSongs(added);
    }

    setState('complete');
  };

  const resetApp = () => {
    setState('idle');
    setSelectedImages([]);
    setProgress({ current: 0, total: 0, status: '' });
    setResults([]);
    setAddedSongs([]);
  };

  const getTotalStats = () => {
    const detected = results.reduce((acc, r) => acc + r.songs.length, 0);
    const failed = results.filter(r => r.error).length;
    return { detected, failed, added: addedSongs.length };
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Song Capture</Text>
        <Text style={styles.subtitle}>Detect songs from photos and add to queue</Text>

        {state === 'idle' && (
          <TouchableOpacity style={styles.addButton} onPress={pickImages}>
            <Text style={styles.addButtonIcon}>+</Text>
            <Text style={styles.addButtonText}>Add Photos</Text>
            <Text style={styles.addButtonSubtext}>Screenshots, Shazam, signage, etc.</Text>
          </TouchableOpacity>
        )}

        {state === 'selecting' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{selectedImages.length} Photo(s) Selected</Text>
              <TouchableOpacity onPress={pickImages}>
                <Text style={styles.addMoreText}>+ Add More</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
              {selectedImages.map((uri) => (
                <View key={uri} style={styles.imagePreviewContainer}>
                  <Image source={{ uri }} style={styles.imagePreview} />
                  <TouchableOpacity style={styles.removeButton} onPress={() => removeImage(uri)}>
                    <Text style={styles.removeButtonText}>x</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.consumeButton} onPress={startProcessing}>
              <Text style={styles.consumeButtonText}>Consume</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={resetApp}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {state === 'processing' && (
          <View style={styles.section}>
            <View style={styles.processingCard}>
              <ActivityIndicator size="large" color="#1DB954" />
              <Text style={styles.processingTitle}>Processing...</Text>
              <Text style={styles.processingStatus}>{progress.status}</Text>
              <Text style={styles.processingProgress}>
                Image {progress.current} of {progress.total}
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${(progress.current / progress.total) * 100}%` },
                  ]}
                />
              </View>
            </View>
          </View>
        )}

        {state === 'complete' && (
          <View style={styles.section}>
            <View style={styles.completeCard}>
              <Text style={styles.completeIcon}>OK</Text>
              <Text style={styles.completeTitle}>Complete!</Text>
              
              {(() => {
                const stats = getTotalStats();
                return (
                  <View style={styles.statsContainer}>
                    <View style={styles.statItem}>
                      <Text style={styles.statNumber}>{stats.detected}</Text>
                      <Text style={styles.statLabel}>Detected</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statNumber, styles.statAdded]}>{stats.added}</Text>
                      <Text style={styles.statLabel}>Queued</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statNumber, styles.statFailed]}>{stats.failed}</Text>
                      <Text style={styles.statLabel}>Failed</Text>
                    </View>
                  </View>
                );
              })()}

              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  Songs have been added to your queue. Go to the Queue tab to sync them to your connected music platforms.
                </Text>
              </View>

              {addedSongs.length > 0 && (
                <View style={styles.songList}>
                  <Text style={styles.songListTitle}>Songs added to queue:</Text>
                  {addedSongs.map((song) => (
                    <Text key={song.id} style={styles.songItem}>
                      - {song.title} - {song.artist}
                    </Text>
                  ))}
                </View>
              )}

              {results.filter(r => r.error).length > 0 && (
                <View style={styles.failedList}>
                  <Text style={styles.failedListTitle}>Failed images (check Flagged tab):</Text>
                  {results.filter(r => r.error).map((r, index) => (
                    <Text key={index} style={styles.failedItem}>
                      - Image {results.indexOf(r) + 1}: {r.error}
                    </Text>
                  ))}
                </View>
              )}

              <TouchableOpacity style={styles.consumeButton} onPress={resetApp}>
                <Text style={styles.consumeButtonText}>Add More Photos</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#b3b3b3',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addButton: {
    backgroundColor: '#282828',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#404040',
    borderStyle: 'dashed',
  },
  addButtonIcon: {
    fontSize: 48,
    color: '#1DB954',
    marginBottom: 8,
  },
  addButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  addButtonSubtext: {
    fontSize: 14,
    color: '#b3b3b3',
  },
  addMoreText: {
    color: '#1DB954',
    fontWeight: '600',
  },
  imageScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  imagePreviewContainer: {
    marginRight: 12,
    position: 'relative',
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  consumeButton: {
    backgroundColor: '#1DB954',
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  consumeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: '#b3b3b3',
    fontSize: 16,
  },
  processingCard: {
    backgroundColor: '#282828',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  processingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  processingStatus: {
    fontSize: 14,
    color: '#b3b3b3',
    marginBottom: 8,
    textAlign: 'center',
  },
  processingProgress: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#404040',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1DB954',
  },
  completeCard: {
    backgroundColor: '#282828',
    borderRadius: 12,
    padding: 24,
  },
  completeIcon: {
    fontSize: 32,
    color: '#1DB954',
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: 'bold',
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#404040',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1DB954',
  },
  statAdded: {
    color: '#1DB954',
  },
  statFailed: {
    color: '#ff4444',
  },
  statLabel: {
    fontSize: 14,
    color: '#b3b3b3',
  },
  infoBox: {
    backgroundColor: 'rgba(29, 185, 84, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  infoText: {
    color: '#1DB954',
    fontSize: 14,
    textAlign: 'center',
  },
  songList: {
    marginBottom: 16,
  },
  songListTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  songItem: {
    color: '#b3b3b3',
    fontSize: 13,
    marginBottom: 4,
  },
  failedList: {
    marginBottom: 16,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 12,
  },
  failedListTitle: {
    color: '#ff4444',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  failedItem: {
    color: '#ff4444',
    fontSize: 13,
    marginBottom: 4,
  },
});
