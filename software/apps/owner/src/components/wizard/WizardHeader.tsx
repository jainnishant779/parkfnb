import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, fonts } from '../../theme/kit';

interface Props {
  title: string;
  step: number;
  totalSteps: number;
  onBack: () => void;
  onClose?: () => void;
}

export default function WizardHeader({ title, step, totalSteps, onBack, onClose }: Props) {
  const segments = Array.from({ length: Math.max(totalSteps, 1) });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />
      <View style={styles.row}>
        <TouchableOpacity onPress={onBack} style={styles.iconBtn} hitSlop={8} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
        {onClose ? (
          <TouchableOpacity
            onPress={onClose}
            style={[styles.iconBtn, styles.closeBtn]}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={palette.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>
      {/* Segmented progress: ink for done/current steps, grey for the rest. */}
      <View style={styles.progressRow}>
        {segments.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressSeg,
              i < step ? styles.progressSegDone : null,
              i > 0 && styles.progressSegGap,
            ]}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: palette.bg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: 56,
  },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-start' },
  closeBtn: {
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: palette.surface,
  },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { ...fonts.semibold, fontSize: 19, letterSpacing: -0.2, color: palette.text },
  sub: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted, marginTop: 1 },
  progressRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: palette.line },
  progressSegDone: { backgroundColor: palette.ink },
  progressSegGap: { marginLeft: 6 },
});
