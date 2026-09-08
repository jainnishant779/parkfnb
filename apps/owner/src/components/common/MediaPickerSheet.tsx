import React from 'react';
import { Modal, Pressable, View, Text, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { PickSource } from '../../utils/mediaUpload';

interface Props {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onPick: (source: PickSource) => void;
  showRemove?: boolean;
  onRemove?: () => void;
}

export default function MediaPickerSheet({
  visible,
  title = 'Add photo',
  onClose,
  onPick,
  showRemove,
  onRemove,
}: Props) {
  return visible ? (

      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>

          <Pressable style={styles.option} onPress={() => onPick('camera')}>
            <Ionicons name="camera-outline" size={22} color="#111827" />
            <Text style={styles.optionText}>Take Photo</Text>
          </Pressable>

          <Pressable style={styles.option} onPress={() => onPick('gallery')}>
            <Ionicons name="images-outline" size={22} color="#111827" />
            <Text style={styles.optionText}>Choose from Gallery</Text>
          </Pressable>

          {showRemove && onRemove ? (
            <Pressable style={styles.option} onPress={onRemove}>
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
              <Text style={[styles.optionText, { color: '#EF4444' }]}>Remove</Text>
            </Pressable>
          ) : null}

          <Pressable style={[styles.option, styles.cancel]} onPress={onClose}>
            <Text style={[styles.optionText, { color: '#6B7280', textAlign: 'center', flex: 1 }]}>
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    
    ) : null;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  cancel: { marginTop: 4 },
  optionText: { fontSize: 15, color: '#111827', fontWeight: '500' },
});
