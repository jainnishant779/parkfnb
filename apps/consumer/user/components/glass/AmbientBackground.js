/**
 * AmbientBackground — flat warm-mint canvas. We removed every animated
 * decoration (SVG gradients, RN-Skia auras, react-native-linear-
 * gradient slabs) because each one either stuttered or crashed Fabric
 * on older Android. The eye reads the soft mint with the glass card
 * + shadow as enough atmosphere; we don't need painted decoration.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { palette } from '../../theme';

const AmbientBackground = ({ children }) => {
  return (
    <View style={[styles.wrap, { backgroundColor: palette.bg }]}>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    overflow: 'hidden',
  },
});

export default AmbientBackground;
