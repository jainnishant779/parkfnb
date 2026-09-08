import React from 'react';
import { View, Text, Pressable, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';

interface Props {
  title: string;
  step: number;
  totalSteps: number;
  onBack: () => void;
  onClose?: () => void;
}

export default function WizardHeader({ title, step, totalSteps, onBack, onClose }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.row}>
        <Pressable onPress={onBack} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#1F2937" />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.sub}>Step {step} of {totalSteps}</Text>
        </View>
        {onClose ? (
          <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="close" size={22} color="#6B7280" />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${(step / totalSteps) * 100}%` }]} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: '#FFFFFF' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  progressBg: { height: 3, backgroundColor: '#E5E7EB' },
  progressFill: { height: 3, backgroundColor: '#0D7377' },
});
