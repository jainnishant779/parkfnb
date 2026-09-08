import React, { memo, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';

export type KpiIconName = 'cash' | 'calendar' | 'car' | 'trending-up' | 'stats-chart';

export interface KpiCardProps {
  icon: KpiIconName;
  value: string;
  label: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'primary' | 'success' | 'warning' | 'danger';
  onPress?: () => void;
  testID?: string;
}

const ICON_MAP: Record<KpiIconName, string> = {
  cash: 'cash-outline',
  calendar: 'calendar-outline',
  car: 'car-outline',
  'trending-up': 'trending-up-outline',
  'stats-chart': 'stats-chart-outline',
};

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
};

function KpiCard({
  icon,
  value,
  label,
  trend,
  color = 'primary',
  onPress,
  testID,
}: KpiCardProps) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);
  const scale = useSharedValue(1);

  // Get color based on variant
  const accentColor = useMemo(() => {
    switch (color) {
      case 'success':
        return theme.success;
      case 'warning':
        return theme.warning;
      case 'danger':
        return theme.danger;
      case 'primary':
      default:
        return theme.primary;
    }
  }, [color, theme]);

  const accentBgColor = useMemo(() => {
    switch (color) {
      case 'success':
        return theme.successLight;
      case 'warning':
        return theme.warningLight;
      case 'danger':
        return theme.dangerLight;
      case 'primary':
      default:
        return theme.primaryLight;
    }
  }, [color, theme]);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.95, SPRING_CONFIG);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, SPRING_CONFIG);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconName = ICON_MAP[icon] || 'help-circle-outline';

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!onPress}
      testID={testID}
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="button"
      style={styles.pressable}
    >
      <Animated.View
        style={[
          styles.container,
          { backgroundColor: theme.surface },
          animatedStyle,
        ]}
      >
        {/* Icon Container */}
        <View style={[styles.iconContainer, { backgroundColor: accentBgColor }]}>
          <Ionicons name={iconName} size={14} color={accentColor} />
        </View>

        {/* Value */}
        <Text
          style={[styles.value, { color: theme.text }]}
          numberOfLines={1}
          allowFontScaling
        >
          {value}
        </Text>

        {/* Label & Trend Row */}
        <View style={styles.labelRow}>
          <Text
            style={[styles.label, { color: theme.textMuted }]}
            numberOfLines={1}
            allowFontScaling
          >
            {label}
          </Text>
          {trend && (
            <View style={styles.trendContainer}>
              <Ionicons
                name={trend.isPositive ? 'arrow-up' : 'arrow-down'}
                size={10}
                color={trend.isPositive ? theme.success : theme.danger}
              />
              <Text
                style={[
                  styles.trendText,
                  { color: trend.isPositive ? theme.success : theme.danger },
                ]}
              >
                {Math.abs(trend.value)}%
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {},
  container: {
    width: 120,
    padding: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  value: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as any,
    marginBottom: spacing[1],
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  label: {
    fontSize: fontSize.xs,
    flexShrink: 1,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  trendText: {
    fontSize: fontSize.xs - 1,
    fontWeight: fontWeight.medium as any,
  },
});

export default memo(KpiCard);
