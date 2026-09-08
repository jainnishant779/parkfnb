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
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';

export type AlertType = 'kyc' | 'bank' | 'bookings' | 'listing' | 'info' | 'warning';

export interface AlertRowProps {
  id: string;
  type: AlertType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: (id: string) => void;
  testID?: string;
}

const ALERT_CONFIG: Record<AlertType, { icon: string; colorKey: 'warning' | 'danger' | 'primary' | 'success' }> = {
  kyc: { icon: 'shield-checkmark-outline', colorKey: 'warning' },
  bank: { icon: 'card-outline', colorKey: 'danger' },
  bookings: { icon: 'calendar-outline', colorKey: 'primary' },
  listing: { icon: 'business-outline', colorKey: 'primary' },
  info: { icon: 'information-circle-outline', colorKey: 'primary' },
  warning: { icon: 'warning-outline', colorKey: 'warning' },
};

function AlertRow({
  id,
  type,
  title,
  description,
  actionLabel = 'Fix',
  onAction,
  onDismiss,
  testID,
}: AlertRowProps) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);
  const opacity = useSharedValue(1);
  const height = useSharedValue<number | 'auto'>('auto');

  const config = ALERT_CONFIG[type];
  const accentColor = theme[config.colorKey];

  const handleDismiss = useCallback(() => {
    if (onDismiss) {
      opacity.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(onDismiss)(id);
      });
    }
  }, [id, onDismiss, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: `${accentColor}10` },
        animatedStyle,
      ]}
      testID={testID}
    >
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: `${accentColor}20` }]}>
        <Ionicons name={config.icon} size={20} color={accentColor} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>
          {description}
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {onAction && (
          <Pressable
            onPress={onAction}
            style={[styles.actionButton, { backgroundColor: accentColor }]}
            accessibilityLabel={actionLabel}
            accessibilityRole="button"
          >
            <Text style={styles.actionButtonText}>{actionLabel}</Text>
          </Pressable>
        )}
        {onDismiss && (
          <Pressable
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Dismiss alert"
            accessibilityRole="button"
            style={styles.dismissButton}
          >
            <Ionicons name="close" size={18} color={theme.textMuted} />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[2],
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    marginHorizontal: spacing[3],
    gap: 2,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  description: {
    fontSize: fontSize.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  actionButton: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
  },
  dismissButton: {
    padding: spacing[1],
  },
});

export default memo(AlertRow);
