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

export default function BankSetupScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Bank Setup" />
      <View style={styles.body}>
        <View style={styles.hero}>
          <StatusTag label="Payouts" tone="ink" />
          <Text style={styles.heroTitle}>Bank Setup</Text>
          <Text style={styles.heroSub}>Add the account your parking earnings are paid into.</Text>
          <View style={styles.heroArt} pointerEvents="none">
            <IsoBlock size={130} tone="blue" />
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
    backgroundColor: palette.blueSoft,
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
