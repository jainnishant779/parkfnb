import React, { memo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, fonts } from '../../theme/kit';

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

/**
 * Icon-only tab for the floating pill tab bar. The focused tab sits in a
 * solid ink circle with a white icon; the label is kept for accessibility.
 */
function TabItem({
  icon,
  label,
  isActive,
  onPress,
  badgeCount,
  showDot,
  testID,
}: TabItemProps) {
  const scale = useSharedValue(1);
  const activeValue = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    activeValue.value = withTiming(isActive ? 1 : 0, { duration: 180 });
  }, [isActive, activeValue]);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.9, SPRING_CONFIG);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, SPRING_CONFIG);
  }, [scale]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const circleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: activeValue.value,
    transform: [{ scale: 0.7 + activeValue.value * 0.3 }],
  }));

  const iconConfig = ICON_MAP[icon];
  const iconName = isActive ? iconConfig.active : iconConfig.default;
  const iconColor = isActive ? palette.textInverse : palette.text;

  const showBadge = badgeCount !== undefined && badgeCount > 0;
  const badgeText = badgeCount && badgeCount > 99 ? '99+' : String(badgeCount);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.touchable}
      hitSlop={6}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
      testID={testID}
    >
      <Animated.View style={[styles.iconWrap, containerAnimatedStyle]}>
        <Animated.View style={[styles.activeCircle, circleAnimatedStyle]} />
        <Ionicons name={iconName} size={22} color={iconColor} />

        {showBadge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText} allowFontScaling={false} numberOfLines={1}>
              {badgeText}
            </Text>
          </View>
        )}

        {showDot && !showBadge && <View style={styles.dot} />}
      </Animated.View>
    </Pressable>
  );
}

const CIRCLE = 56;

const styles = StyleSheet.create({
  touchable: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCircle: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CIRCLE / 2,
    backgroundColor: palette.ink,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    backgroundColor: palette.danger,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  badgeText: {
    ...fonts.bold,
    color: palette.textInverse,
    fontSize: 10,
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
    top: 13,
    right: 13,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: palette.danger,
    borderWidth: 2,
    borderColor: palette.surface,
  },
});

export default memo(TabItem);
