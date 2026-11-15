/**
 * IsoBlock — car illustration for feature cards. Same API as the consumer
 * app's SVG version, drawn with an icon so the owner app needs no extra
 * native dependency (react-native-svg is not installed here).
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';

const TONES = {
  peach: { body: '#E9A55A', shadow: 'rgba(120,70,20,0.16)' },
  blue: { body: '#8FA9DE', shadow: 'rgba(30,50,100,0.14)' },
  grey: { body: '#BDBDBD', shadow: 'rgba(0,0,0,0.12)' },
};

const IsoBlock = ({ size = 120, tone = 'peach' }) => {
  const c = TONES[tone] || TONES.peach;
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <View
        style={[
          styles.shadow,
          { width: size * 0.78, height: size * 0.18, borderRadius: size, backgroundColor: c.shadow },
        ]}
      />
      <MaterialIcon name="car-hatchback" size={size * 0.78} color={c.body} style={styles.icon} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'flex-end' },
  shadow: { position: 'absolute', bottom: '14%' },
  icon: { transform: [{ rotate: '-8deg' }], marginBottom: '6%' },
});

export default IsoBlock;
