import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { resolveImageUri } from '../../utils/imageUri';
import { pickAndUploadImage, handleMediaUploadError } from '../../utils/mediaUpload';
import MediaPickerSheet from '../common/MediaPickerSheet';
import { AppAlert } from '../common/AppAlert';
import { palette, radii, fonts } from '../../theme/kit';

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
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => remove(uri)}
              hitSlop={6}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={16} color={palette.text} />
            </TouchableOpacity>
          </View>
        ))}
        {images.length < maxCount ? (
          <TouchableOpacity
            style={[styles.tile, styles.addTile]}
            onPress={openPicker}
            disabled={busy}
            activeOpacity={0.8}
          >
            {busy ? (
              <ActivityIndicator color={palette.ink} />
            ) : (
              <>
                <View style={styles.addIcon}>
                  <Ionicons name="add" size={22} color={palette.textInverse} />
                </View>
                <Text style={styles.addText}>Add photo</Text>
              </>
            )}
          </TouchableOpacity>
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
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: palette.fill,
  },
  addTile: {
    borderWidth: 1.5,
    borderColor: palette.peachDeep,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.peachSoft,
  },
  addIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { ...fonts.semibold, fontSize: 12, color: palette.text, marginTop: 6 },
  image: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
  },
});
