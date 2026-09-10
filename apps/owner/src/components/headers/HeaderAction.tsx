import React, { memo, useMemo, useCallback } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import Badge from '../common/Badge';

// Types
export type HeaderIconName =
  | 'back'
  | 'menu'
  | 'close'
  | 'search'
  | 'notifications'
  | 'add'
  | 'filter'
  | 'settings'
  | 'more'
  | 'edit'
  | 'share'
  | 'help'
  | 'refresh'
  | 'trash'
  | 'history';

export interface HeaderActionProps {
  icon: HeaderIconName;
  label: string;
  onPress: () => void;
  badgeCount?: number;
  showDot?: boolean;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  variant?: 'default' | 'primary' | 'danger';
  showBackground?: boolean;
  testID?: string;
}

// Icon mapping
const ICON_MAP: Record<HeaderIconName, string> = {
  back: 'arrow-back',
  menu: 'menu',
  close: 'close',
  search: 'search',
  notifications: 'notifications-outline',
  add: 'add',
  filter: 'options-outline',
  settings: 'settings-outline',
  more: 'ellipsis-vertical',
  edit: 'create-outline',
  share: 'share-outline',
  help: 'help-circle-outline',
  refresh: 'refresh',
  trash: 'trash-outline',
  history: 'time-outline',
};

// Spring config for animations
const SPRING_CONFIG = {
  damping: 15,
  stiffness: 200,
};

// HeaderAction component - icon button with press animation and accessibility
function HeaderAction({
  icon,
  label,
  onPress,
  badgeCount,
  showDot,
  disabled = false,
  size = 'medium',
  variant = 'default',
  showBackground = false,
  testID,
}: HeaderActionProps) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);

  // Animation values
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const backgroundOpacity = useSharedValue(0);

  // Get size dimensions
  const dimensions = useMemo(() => {
    switch (size) {
      case 'small':
        return { container: 36, icon: 20, hitSlop: 8 };
      case 'large':
        return { container: 48, icon: 28, hitSlop: 4 };
      case 'medium':
      default:
        return { container: 44, icon: 24, hitSlop: 6 };
    }
  }, [size]);

  // Get variant colors
  const colors = useMemo(() => {
    switch (variant) {
      case 'primary':
        return { icon: theme.primary, background: theme.primaryLight };
      case 'danger':
        return { icon: theme.danger, background: theme.dangerLight };
      case 'default':
      default:
        return { icon: theme.text, background: theme.primaryLight };
    }
  }, [variant, theme]);

  // Handle press in/out
  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.9, SPRING_CONFIG);
    opacity.value = withTiming(0.7, { duration: 100 });
    backgroundOpacity.value = withTiming(1, { duration: 100 });
  }, [scale, opacity, backgroundOpacity]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, SPRING_CONFIG);
    opacity.value = withTiming(1, { duration: 150 });
    backgroundOpacity.value = withTiming(showBackground ? 1 : 0, { duration: 150 });
  }, [scale, opacity, backgroundOpacity, showBackground]);

  // Animated styles
  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.4 : opacity.value,
  }));

  const animatedBackgroundStyle = useAnimatedStyle(() => ({
    opacity: showBackground ? 1 : backgroundOpacity.value,
  }));

  const iconName = ICON_MAP[icon] || 'help-circle-outline';

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      hitSlop={{
        top: dimensions.hitSlop,
        bottom: dimensions.hitSlop,
        left: dimensions.hitSlop,
        right: dimensions.hitSlop,
      }}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
    >
      <Animated.View
        style={[
          styles.container,
          {
            width: dimensions.container,
            height: dimensions.container,
          },
          animatedContainerStyle,
        ]}
      >
        {/* Background layer */}
        <Animated.View
          style={[
            styles.background,
            {
              backgroundColor: colors.background,
              borderRadius: dimensions.container / 2,
            },
            animatedBackgroundStyle,
          ]}
        />

        {/* Icon */}
        <Ionicons
          name={iconName}
          size={dimensions.icon}
          color={disabled ? theme.textMuted : colors.icon}
        />

        {/* Badge */}
        {(badgeCount !== undefined && badgeCount > 0) || showDot ? (
          <View style={styles.badgeContainer}>
            <Badge
              count={badgeCount}
              showDot={showDot && !badgeCount}
              size={size === 'small' ? 'small' : 'medium'}
              testID={testID ? `${testID}-badge` : undefined}
            />
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  badgeContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
});

export default memo(HeaderAction);
