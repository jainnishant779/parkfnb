import React, { memo, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { palette, radii, fonts } from '../../theme/kit';

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

// Card fill per accent: warm alerts on peach, info on blue, errors on red wash.
const TONE_BG: Record<'warning' | 'danger' | 'primary' | 'success', string> = {
  warning: palette.peachSoft,
  danger: palette.dangerSoft,
  primary: palette.blueSoft,
  success: palette.successSoft,
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
  const accentColor = config.colorKey === 'danger' ? palette.danger : palette.text;
  const toneBg = TONE_BG[config.colorKey];

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
        { backgroundColor: toneBg },
        animatedStyle,
      ]}
      testID={testID}
    >
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: palette.surface }]}>
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
          <TouchableOpacity
            onPress={onAction}
            activeOpacity={0.8}
            style={styles.actionButton}
            accessibilityLabel={actionLabel}
            accessibilityRole="button"
          >
            <Text style={styles.actionButtonText}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
        {onDismiss && (
          <TouchableOpacity
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Dismiss alert"
            accessibilityRole="button"
            style={styles.dismissButton}
          >
            <Ionicons name="close" size={16} color={theme.text} />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: radii.lg,
    marginBottom: 10,
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    marginHorizontal: 12,
    gap: 2,
  },
  title: {
    ...fonts.semibold,
    fontSize: 15,
  },
  description: {
    ...fonts.medium,
    fontSize: 12.5,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 14,
    height: 34,
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
  },
  actionButtonText: {
    ...fonts.semibold,
    color: palette.textInverse,
    fontSize: 13,
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(AlertRow);
