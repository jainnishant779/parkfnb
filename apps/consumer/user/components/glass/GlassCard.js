/**
 * GlassCard — translucent rounded surface that reads as glass on the
 * coloured app background.
 *
 * Native backdrop blur isn't viable on this device:
 *   - @react-native-community/blur on Android renders an opaque tint
 *     (real blur is iOS-only without experimental flags)
 *   - the BlurView+Skia+SVG combo previously SIGSEGV'd Fabric
 *
 * Approach: a single translucent white fill + a soft border + a generous
 * lifted shadow. Earlier versions added an inner "shine" band at 50%
 * height to fake highlight, but it rendered as a visible horizontal box
 * inside the card on this device, so it's been removed.
 */
import React from 'react';
import { View } from 'react-native';
import { palette, radii, shadow } from '../../theme';

const GlassCard = ({
  children,
  style,
  // intensity prop kept for API compatibility (no native blur in use)
  // eslint-disable-next-line no-unused-vars
  intensity = 18,
  tint = 'light',
  radius = radii.lg,
  bordered = true,
  elevated = true,
}) => {
  const isDark = tint === 'dark';
  const baseFill = isDark
    ? 'rgba(20,20,30,0.55)'
    : 'rgba(255,255,255,0.85)';
  const borderColor = isDark
    ? 'rgba(255,255,255,0.10)'
    : 'rgba(255,255,255,0.85)';

  return (
    <View
      style={[
        {
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: baseFill,
          borderWidth: bordered ? 1 : 0,
          borderColor,
        },
        elevated && shadow.lifted,
        style,
      ]}
    >
      {children}
    </View>
  );
};

export default GlassCard;
