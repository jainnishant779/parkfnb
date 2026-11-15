import React, { memo, useMemo, useCallback } from 'react';
import {
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
import { palette, radii, fonts } from '../../theme/kit';

export type QuickActionIcon = 'add' | 'calendar' | 'pricetag' | 'wallet' | 'settings' | 'stats';

export interface QuickActionTileProps {
  icon: QuickActionIcon;
  label: string;
  color?: 'primary' | 'success' | 'warning' | 'danger';
  onPress: () => void;
  testID?: string;
}

const ICON_MAP: Record<QuickActionIcon, string> = {
  add: 'add-circle-outline',
  calendar: 'calendar-outline',
  pricetag: 'pricetag-outline',
  wallet: 'wallet-outline',
  settings: 'settings-outline',
  stats: 'stats-chart-outline',
};

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 200,
};

function QuickActionTile({
  icon,
  label,
  color = 'primary',
  onPress,
  testID,
}: QuickActionTileProps) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);
  const scale = useSharedValue(1);

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
        return palette.text;
    }
  }, [color, theme]);

  const bgColor = useMemo(() => {
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
    scale.value = withSpring(0.92, SPRING_CONFIG);
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
      testID={testID}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={styles.pressable}
    >
      <Animated.View
        style={[
          styles.container,
          { backgroundColor: bgColor },
          animatedStyle,
        ]}
      >
        <Animated.View style={styles.iconCircle}>
          <Ionicons name={iconName} size={20} color={accentColor} />
        </Animated.View>
        <Text
          style={[styles.label, { color: palette.text }]}
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
  pressable: {
    width: '48%',
  },
  container: {
    padding: 14,
    borderRadius: radii.lg,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 10,
    minHeight: 96,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...fonts.semibold,
    fontSize: 14,
  },
});

export default memo(QuickActionTile);
