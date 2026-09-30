import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { palette, fonts } from '../../theme/kit';
import { IsoBlock } from '../../components/ui';

export default function DisputesListScreen() {
  return (
    <View style={styles.container}>
      <IsoBlock size={110} tone="blue" />
      <Text style={styles.title}>Disputes List</Text>
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
    fontSize: 20,
    color: palette.text,
    marginTop: 14,
  },
});
