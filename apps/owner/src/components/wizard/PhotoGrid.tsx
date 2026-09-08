import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { resolveImageUri } from '../../utils/imageUri';
import { pickAndUploadImage, handleMediaUploadError } from '../../utils/mediaUpload';
import MediaPickerSheet from '../common/MediaPickerSheet';
import { AppAlert } from '../common/AppAlert';

interface Props {
  images: string[];
  onChange: (images: string[]) => void;
  maxCount?: number;
}

const TILE_SIZE = 100;

export default function PhotoGrid({ images, onChange, maxCount = 10 }: Props) {
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const openPicker = () => {
    if (images.length >= maxCount) {
      AppAlert.alert('Limit reached', `Maximum ${maxCount} photos.`);
      return;
    }
    setSheetOpen(true);
  };

  const handlePick = async (source: 'camera' | 'gallery') => {
    setSheetOpen(false);
    setBusy(true);
    try {
      // 16:9 matches the consumer app's full-width 220px main gallery image.
      const result = await pickAndUploadImage({ source, aspect: 'property' });
      onChange([...images, result.url]);
    } catch (err) {
      handleMediaUploadError(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = (uri: string) => {
    onChange(images.filter((u) => u !== uri));
  };

  return (
    <>
      <View style={styles.grid}>
        {images.map((uri, idx) => (
          <View key={`${uri}-${idx}`} style={styles.tile}>
            <Image source={{ uri: resolveImageUri(uri) }} style={styles.image} />
            <Pressable style={styles.removeBtn} onPress={() => remove(uri)} hitSlop={6}>
              <Ionicons name="close-circle" size={22} color="#EF4444" />
            </Pressable>
          </View>
        ))}
        {images.length < maxCount ? (
          <Pressable style={[styles.tile, styles.addTile]} onPress={openPicker} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#0D7377" />
            ) : (
              <>
                <Ionicons name="add" size={32} color="#0D7377" />
                <Text style={styles.addText}>Add photo</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      <MediaPickerSheet
        visible={sheetOpen}
        title="Add photo"
        onClose={() => setSheetOpen(false)}
        onPick={handlePick}
      />
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  addTile: {
    borderWidth: 2,
    borderColor: '#0D7377',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F5F4',
  },
  addText: { fontSize: 12, color: '#0D7377', marginTop: 4, fontWeight: '500' },
  image: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
  },
});
