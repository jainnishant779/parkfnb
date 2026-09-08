import React, { memo, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';

// Tab icon mapping
export type TabIconName = 'home' | 'list' | 'calendar' | 'wallet' | 'menu' | 'business' | 'people' | 'shield' | 'map';

const ICON_MAP: Record<TabIconName, { default: string; active: string }> = {
  home: { default: 'home-outline', active: 'home' },
  list: { default: 'list-outline', active: 'list' },
  calendar: { default: 'calendar-outline', active: 'calendar' },
  wallet: { default: 'wallet-outline', active: 'wallet' },
  menu: { default: 'menu-outline', active: 'menu' },
  business: { default: 'business-outline', active: 'business' },
  people: { default: 'people-outline', active: 'people' },
  shield: { default: 'shield-checkmark-outline', active: 'shield-checkmark' },
  map: { default: 'map-outline', active: 'map' },
};

// Animation configs
const SPRING_CONFIG = {
  damping: 15,
  stiffness: 200,
  mass: 0.8,
};

export interface TabItemProps {
  icon: TabIconName;
  label: string;
  isActive: boolean;
  onPress: () => void;
  badgeCount?: number;
  showDot?: boolean;
  testID?: string;
}

function TabItem({
  icon,
  label,
  isActive,
  onPress,
  badgeCount,
  showDot,
  testID,
}: TabItemProps) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);

  // Animation values
  const scale = useSharedValue(1);
  const activeValue = useSharedValue(isActive ? 1 : 0);
  const pressOpacity = useSharedValue(1);

  // Update active animation when isActive changes
  useEffect(() => {
    activeValue.value = withSpring(isActive ? 1 : 0, SPRING_CONFIG);
  }, [isActive, activeValue]);

  // Handle press states
  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.92, SPRING_CONFIG);
    pressOpacity.value = withTiming(0.7, { duration: 100 });
  }, [scale, pressOpacity]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, SPRING_CONFIG);
    pressOpacity.value = withTiming(1, { duration: 150 });
  }, [scale, pressOpacity]);

  // Animated styles
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: pressOpacity.value,
  }));

  const iconAnimatedStyle = useAnimatedStyle(() => {
    const iconScale = interpolate(
      activeValue.value,
      [0, 1],
      [1, 1.08],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ scale: iconScale }],
    };
  });

  const indicatorAnimatedStyle = useAnimatedStyle(() => ({
    opacity: activeValue.value,
    transform: [
      {
        scale: interpolate(
          activeValue.value,
          [0, 1],
          [0.8, 1],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  // Get icon names
  const iconConfig = ICON_MAP[icon];
  const iconName = isActive ? iconConfig.active : iconConfig.default;
  const iconColor = isActive ? theme.primary : theme.textMuted;

  // Determine if we should show badge
  const showBadge = badgeCount !== undefined && badgeCount > 0;
  const badgeText = badgeCount && badgeCount > 99 ? '99+' : String(badgeCount);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.touchable}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
      testID={testID}
    >
      <Animated.View style={[styles.container, containerAnimatedStyle]}>
        {/* Active Indicator Pill */}
        <Animated.View
          style={[
            styles.activeIndicator,
            { backgroundColor: theme.primaryLight },
            indicatorAnimatedStyle,
          ]}
        />

        {/* Icon Container */}
        <Animated.View style={[styles.iconContainer, iconAnimatedStyle]}>
          <Ionicons
            name={iconName}
            size={24}
            color={iconColor}
          />

          {/* Numeric Badge */}
          {showBadge && (
            <View style={[styles.badge, { backgroundColor: theme.danger }]}>
              <Text
                style={styles.badgeText}
                allowFontScaling={false}
                numberOfLines={1}
              >
                {badgeText}
              </Text>
            </View>
          )}

          {/* Dot Indicator */}
          {showDot && !showBadge && (
            <View style={[styles.dot, { backgroundColor: theme.danger }]} />
          )}
        </Animated.View>

        {/* Label */}
        <Text
          style={[
            styles.label,
            { color: isActive ? theme.primary : theme.textMuted },
            isActive && styles.labelActive,
          ]}
          numberOfLines={1}
          allowFontScaling
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchable: {
    flex: 1,
    minHeight: 56,
    minWidth: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    left: spacing[1],
    right: spacing[1],
    bottom: 0,
    borderRadius: borderRadius.lg,
  },
  iconContainer: {
    position: 'relative',
    marginBottom: spacing[1],
    zIndex: 1,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
    ...Platform.select({
      android: {
        lineHeight: 12,
      },
    }),
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  label: {
    fontSize: 11,
    fontWeight: fontWeight.medium as any,
    textAlign: 'center',
    zIndex: 1,
  },
  labelActive: {
    fontWeight: fontWeight.semibold as any,
  },
});

export default memo(TabItem);
