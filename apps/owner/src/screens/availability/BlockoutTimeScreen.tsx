import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { palette, fonts } from '../../theme/kit';
import { IsoBlock } from '../../components/ui';

export default function BlockoutTimeScreen() {
  return (
    <View style={styles.container}>
      <IsoBlock size={120} tone="peach" />
      <Text style={styles.title}>Blockout Time</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bg,
  },
  title: {
    ...fonts.semibold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: palette.text,
    marginTop: 12,
  },
});
