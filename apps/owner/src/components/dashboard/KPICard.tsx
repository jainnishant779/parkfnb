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
import { palette, radii, fonts, shadow } from '../../theme/kit';

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
        return palette.peachSoft;
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
          <Ionicons name={iconName} size={18} color={accentColor} />
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
                size={11}
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
    width: 128,
    padding: 14,
    borderRadius: radii.lg,
    ...shadow.soft,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  value: {
    ...fonts.semibold,
    fontSize: 24,
    letterSpacing: -0.8,
    marginBottom: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    ...fonts.medium,
    fontSize: 12,
    flexShrink: 1,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  trendText: {
    ...fonts.semibold,
    fontSize: 11,
  },
});

export default memo(KpiCard);
