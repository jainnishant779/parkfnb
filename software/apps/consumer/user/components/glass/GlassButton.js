/**
 * GlassButton — pill-shaped CTA. Three variants:
 *   - 'solid' : ink-navy background, white text (primary action)
 *   - 'glass' : translucent white background, dark text
 *   - 'ghost' : no background, dark text
 *
 * Kept intentionally simple (TouchableOpacity, no Animated wrapper)
 * because the previous Pressable+Animated.scale combo was rendering
 * the background as transparent on Galaxy S8 / Fabric, leaving the
 * button looking like missing chrome.
 */
import React from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { palette, radii, typography, shadow } from '../../theme';

const ArrowIcon = ({ color = palette.textInverse, size = 16 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 12h13m0 0-5-5m5 5-5 5"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const GlassButton = ({
  label,
  onPress,
  variant = 'solid',
  loading = false,
  disabled = false,
  iconRight = true,
  iconLeft = null,
  style,
  textStyle,
  fullWidth = false,
  compact = false,
}) => {
  const isInk = variant === 'solid';
  const isGhost = variant === 'ghost';

  const bg = isInk
    ? palette.accent
    : isGhost
    ? 'transparent'
    : palette.glassWhiteStrong;
  const textColor = isInk ? palette.textInverse : palette.text;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.base,
        compact && styles.compact,
        {
          backgroundColor: bg,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.45 : 1,
          borderWidth: variant === 'glass' ? StyleSheet.hairlineWidth : 0,
          borderColor: palette.glassBorder,
        },
        !isGhost && shadow.soft,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <View style={styles.row}>
          {iconLeft ? <View style={{ marginRight: 8 }}>{iconLeft}</View> : null}
          {label ? (
            <Text style={[typography.button, { color: textColor }, textStyle]}>
              {label}
            </Text>
          ) : null}
          {iconRight ? (
            <View style={[styles.arrow, isInk && styles.arrowInk]}>
              <ArrowIcon color={isInk ? palette.textInverse : palette.text} size={16} />
            </View>
          ) : null}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  compact: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    minHeight: 44,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    marginLeft: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowInk: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
});

export { ArrowIcon };
export default GlassButton;
