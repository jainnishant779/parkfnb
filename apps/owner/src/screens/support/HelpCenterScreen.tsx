import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Kit from '../../theme/kit';
import * as UI from '../../components/ui';

// The UI kit is plain JS; give it loose component types.
const { Card, ScreenHeader, EmptyState } = UI as unknown as Record<string, React.ComponentType<any>>;
const { palette } = Kit;

export default function HelpCenterScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader
        title="Help Center"
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />
      <View style={styles.body}>
        <Card padded={false}>
          <EmptyState
            title="Help Center"
            subtitle="Answers and guides will appear here soon."
            tone="peach"
          />
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
