import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Animated,
  Pressable,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';

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
    iconBg: '#E8F5F4',
    iconColor: '#0D7377',
    trendPositive: '#10B981',
    trendNegative: '#EF4444',
    accent: '#0D7377',
  },
  success: {
    iconBg: '#ECFDF5',
    iconColor: '#10B981',
    trendPositive: '#10B981',
    trendNegative: '#EF4444',
    accent: '#10B981',
  },
  warning: {
    iconBg: '#FFFBEB',
    iconColor: '#F59E0B',
    trendPositive: '#10B981',
    trendNegative: '#EF4444',
    accent: '#F59E0B',
  },
  info: {
    iconBg: '#E8F5F4',
    iconColor: '#0D7377',
    trendPositive: '#10B981',
    trendNegative: '#EF4444',
    accent: '#0D7377',
  },
  purple: {
    iconBg: '#F5F3FF',
    iconColor: '#8B5CF6',
    trendPositive: '#10B981',
    trendNegative: '#EF4444',
    accent: '#8B5CF6',
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
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.pressable,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${amount}`}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  pressable: {
    borderRadius: borderRadius.xl,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    minWidth: 140,
    maxWidth: 160,
    marginRight: spacing[3],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  amount: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
    color: '#1E293B',
    marginBottom: spacing[1],
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
    color: '#64748B',
    marginBottom: spacing[2],
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendText: {
    fontSize: 11,
    fontWeight: fontWeight.medium as any,
  },
});
