import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette, radii } from '../../theme/kit';
import { ScreenHeader, EmptyState } from '../../components/ui';

export default function SettingsScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Settings"
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />
      <View style={styles.card}>
        <EmptyState
          tone="blue"
          title="Settings"
          subtitle="App settings will be available here."
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: radii.xl,
    backgroundColor: palette.surface,
  },
});
