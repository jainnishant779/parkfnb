// Snackbar Component - Toast notifications with undo support
import React, { memo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, radii, fonts } from '../../../theme/kit';

export interface SnackbarProps {
  visible: boolean;
  message: string;
  variant?: 'success' | 'error' | 'info' | 'warning';
  action?: {
    label: string;
    onPress: () => void;
  };
  duration?: number;
  onDismiss: () => void;
  testID?: string;
}

function Snackbar({
  visible,
  message,
  variant = 'info',
  action,
  duration = 4000,
  onDismiss,
  testID,
}: SnackbarProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);

  // Auto dismiss timer
  useEffect(() => {
    if (visible && duration > 0 && !action) {
      const timer = setTimeout(onDismiss, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, onDismiss, action]);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 15, stiffness: 200 });
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withSpring(100, { damping: 15, stiffness: 200 });
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [visible, translateY, opacity]);

  const getVariantStyles = useCallback(() => {
    switch (variant) {
      case 'success':
        return {
          icon: 'checkmark-circle',
          iconColor: palette.success,
        };
      case 'error':
        return {
          icon: 'close-circle',
          iconColor: palette.danger,
        };
      case 'warning':
        return {
          icon: 'warning',
          iconColor: palette.warning,
        };
      case 'info':
      default:
        return {
          icon: 'information-circle',
          iconColor: palette.peach,
        };
    }
  }, [variant]);

  const variantStyles = getVariantStyles();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const handleAction = useCallback(() => {
    action?.onPress();
    onDismiss();
  }, [action, onDismiss]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: insets.bottom + 16 },
        animatedStyle,
      ]}
      testID={testID}
    >
      <View style={styles.snackbar}>
        <Ionicons
          name={variantStyles.icon}
          size={20}
          color={variantStyles.iconColor}
          style={styles.icon}
        />
        <Text
          style={styles.message}
          numberOfLines={2}
        >
          {message}
        </Text>
        {action && (
          <Pressable
            onPress={handleAction}
            style={styles.actionButton}
            accessibilityLabel={action.label}
            accessibilityRole="button"
            testID={testID ? `${testID}-action` : undefined}
          >
            <Text style={styles.actionLabel}>
              {action.label}
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={onDismiss}
          style={styles.dismissButton}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
        >
          <Ionicons
            name="close"
            size={18}
            color={palette.textSubtle}
          />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  snackbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 18,
    paddingRight: 10,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
  },
  icon: {
    marginRight: 10,
  },
  message: {
    ...fonts.medium,
    flex: 1,
    color: palette.textInverse,
    fontSize: 14,
  },
  actionButton: {
    marginLeft: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: palette.peach,
  },
  actionLabel: {
    ...fonts.semibold,
    fontSize: 13,
    color: palette.text,
  },
  dismissButton: {
    marginLeft: 6,
    padding: 4,
  },
});

export default memo(Snackbar);
