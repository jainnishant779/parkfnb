import React from 'react';
import { Pressable, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { PickSource } from '../../utils/mediaUpload';
import { palette, radii, fonts } from '../../theme/kit';

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
  const insets = useSafeAreaInsets();

  return visible ? (
    <Pressable style={styles.overlay} onPress={onClose}>
      <Pressable
        style={[styles.sheet, { paddingBottom: Math.max(28, insets.bottom + 16) }]}
        onPress={(e) => e.stopPropagation()}
      >
        <View style={styles.handle} />
        <Text style={styles.title}>{title}</Text>

        <View style={styles.group}>
          <TouchableOpacity
            style={styles.option}
            activeOpacity={0.7}
            onPress={() => onPick('camera')}
          >
            <View style={styles.optionIcon}>
              <Ionicons name="camera-outline" size={20} color={palette.text} />
            </View>
            <Text style={styles.optionText}>Take Photo</Text>
            <Ionicons name="chevron-forward" size={18} color={palette.textSubtle} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.option}
            activeOpacity={0.7}
            onPress={() => onPick('gallery')}
          >
            <View style={styles.optionIcon}>
              <Ionicons name="images-outline" size={20} color={palette.text} />
            </View>
            <Text style={styles.optionText}>Choose from Gallery</Text>
            <Ionicons name="chevron-forward" size={18} color={palette.textSubtle} />
          </TouchableOpacity>

          {showRemove && onRemove ? (
            <>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.option} activeOpacity={0.7} onPress={onRemove}>
                <View style={[styles.optionIcon, styles.optionIconDanger]}>
                  <Ionicons name="trash-outline" size={20} color={palette.danger} />
                </View>
                <Text style={[styles.optionText, styles.optionTextDanger]}>Remove</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        <TouchableOpacity style={styles.cancel} activeOpacity={0.7} onPress={onClose}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </Pressable>
    </Pressable>
  ) : null;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
    marginBottom: 14,
  },
  group: {
    backgroundColor: palette.surfaceDim,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionIconDanger: { backgroundColor: palette.dangerSoft },
  optionText: { ...fonts.semibold, flex: 1, fontSize: 15, color: palette.text },
  optionTextDanger: { color: palette.danger },
  divider: { height: 1, backgroundColor: palette.line, marginLeft: 52 },
  cancel: {
    marginTop: 14,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { ...fonts.semibold, fontSize: 15, color: palette.text },
});
