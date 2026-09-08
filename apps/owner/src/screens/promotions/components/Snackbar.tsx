// Snackbar Component - Toast notifications with undo support
import React, { memo, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';

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
  const theme = useMemo(() => getTheme(false), []);
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
          iconColor: '#10B981',
          bgColor: '#0D1F17',
        };
      case 'error':
        return {
          icon: 'close-circle',
          iconColor: '#EF4444',
          bgColor: '#1F0D0D',
        };
      case 'warning':
        return {
          icon: 'warning',
          iconColor: '#F59E0B',
          bgColor: '#1F1A0D',
        };
      case 'info':
      default:
        return {
          icon: 'information-circle',
          iconColor: '#0D7377',
          bgColor: '#0D151F',
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
        { bottom: insets.bottom + spacing[4] },
        animatedStyle,
      ]}
      testID={testID}
    >
      <View style={[styles.snackbar, { backgroundColor: variantStyles.bgColor }]}>
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
            <Text style={[styles.actionLabel, { color: variantStyles.iconColor }]}>
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
            color="#9CA3AF"
          />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    zIndex: 1000,
  },
  snackbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  icon: {
    marginRight: spacing[3],
  },
  message: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  actionButton: {
    marginLeft: spacing[2],
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
  },
  actionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dismissButton: {
    marginLeft: spacing[2],
    padding: spacing[1],
  },
});

export default memo(Snackbar);
