import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, radii, fonts, shadow } from '../../theme/kit';

// ============================================================================
// TYPES
// ============================================================================

export type StatCardVariant = 'default' | 'success' | 'warning' | 'info' | 'purple';

export interface StatCardProps {
  label: string;
  amount: string;
  trendValue?: number; // percentage (positive or negative)
  trendText?: string;
  iconName?: string;
  variant?: StatCardVariant;
  onPress?: () => void;
  testID?: string;
}

// ============================================================================
// THEME
// ============================================================================

const VARIANT_COLORS: Record<StatCardVariant, {
  iconBg: string;
  iconColor: string;
  trendPositive: string;
  trendNegative: string;
  accent: string;
}> = {
  default: {
    iconBg: palette.peachSoft,
    iconColor: palette.text,
    trendPositive: palette.success,
    trendNegative: palette.danger,
    accent: palette.ink,
  },
  success: {
    iconBg: palette.successSoft,
    iconColor: palette.success,
    trendPositive: palette.success,
    trendNegative: palette.danger,
    accent: palette.success,
  },
  warning: {
    iconBg: palette.warningSoft,
    iconColor: palette.warning,
    trendPositive: palette.success,
    trendNegative: palette.danger,
    accent: palette.warning,
  },
  info: {
    iconBg: palette.blueSoft,
    iconColor: palette.text,
    trendPositive: palette.success,
    trendNegative: palette.danger,
    accent: palette.blue,
  },
  purple: {
    iconBg: palette.blueWash,
    iconColor: palette.blue,
    trendPositive: palette.success,
    trendNegative: palette.danger,
    accent: palette.blue,
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function StatCard({
  label,
  amount,
  trendValue,
  trendText,
  iconName = 'wallet-outline',
  variant = 'default',
  onPress,
  testID,
}: StatCardProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const colors = VARIANT_COLORS[variant];

  // Mount animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const isPositiveTrend = trendValue !== undefined && trendValue >= 0;
  const trendColor = isPositiveTrend ? colors.trendPositive : colors.trendNegative;

  const content = (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
      testID={testID}
    >
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: colors.iconBg }]}>
        <Ionicons name={iconName as any} size={20} color={colors.iconColor} />
      </View>

      {/* Amount */}
      <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
        {amount}
      </Text>

      {/* Label */}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>

      {/* Trend */}
      {trendValue !== undefined && (
        <View style={styles.trendContainer}>
          <Ionicons
            name={isPositiveTrend ? 'trending-up' : 'trending-down'}
            size={12}
            color={trendColor}
          />
          <Text style={[styles.trendText, { color: trendColor }]}>
            {isPositiveTrend ? '+' : ''}{trendValue.toFixed(1)}%
            {trendText ? ` ${trendText}` : ''}
          </Text>
        </View>
      )}
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={styles.pressable}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${amount}`}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  pressable: {
    borderRadius: radii.xl,
  },
  container: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 16,
    minWidth: 140,
    maxWidth: 160,
    marginRight: 12,
    ...shadow.soft,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  amount: {
    ...fonts.semibold,
    fontSize: 26,
    letterSpacing: -0.8,
    color: palette.text,
    marginBottom: 2,
  },
  label: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginBottom: 8,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendText: {
    ...fonts.semibold,
    fontSize: 12,
  },
});
