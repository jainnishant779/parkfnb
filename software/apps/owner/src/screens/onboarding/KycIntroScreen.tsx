import React from 'react';
import { View, Text, StyleSheet, type TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as UI from '../../components/ui';
import * as Kit from '../../theme/kit';

// Placeholder screen (not routed; kept for a future multi-step onboarding).
// The UI kit is plain JS; give it loose component types and typed font tokens.
const { ScreenHeader, IsoBlock, StatusTag } = UI as unknown as Record<string, React.ComponentType<any>>;
const { palette, radii } = Kit;
const fonts = Kit.fonts as Record<keyof typeof Kit.fonts, TextStyle>;

export default function KycIntroScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="KYC Intro" />
      <View style={styles.body}>
        <View style={styles.hero}>
          <StatusTag label="Verification" tone="ink" />
          <Text style={styles.heroTitle}>KYC Intro</Text>
          <Text style={styles.heroSub}>A few quick checks before you can publish listings.</Text>
          <View style={styles.heroArt} pointerEvents="none">
            <IsoBlock size={130} tone="peach" />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  body: { paddingHorizontal: 16, paddingTop: 8 },
  hero: {
    backgroundColor: palette.peachSoft,
    borderRadius: radii.xl,
    padding: 20,
    paddingRight: 110,
    minHeight: 160,
    overflow: 'hidden',
  },
  heroTitle: {
    ...fonts.semibold,
    fontSize: 24,
    letterSpacing: -0.5,
    color: palette.text,
    marginTop: 12,
  },
  heroSub: { ...fonts.medium, fontSize: 13.5, lineHeight: 19, color: palette.inkSoft, marginTop: 6 },
  heroArt: { position: 'absolute', right: -30, bottom: -26 },
});
