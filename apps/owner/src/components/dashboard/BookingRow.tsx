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
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { formatTimeRange, formatCurrency } from '../../utils/formatters';
import type { BookingStatus } from '../../constants/mockData';

export interface BookingRowProps {
  id: string;
  renterName: string;
  renterInitials: string;
  listingTitle: string;
  start: string;
  end: string;
  status: BookingStatus;
  amount: number;
  onPress?: () => void;
  isLast?: boolean;
}

const STATUS_CONFIG: Record<BookingStatus, { label: string; colorKey: 'warning' | 'success' | 'primary' | 'textMuted' }> = {
  request: { label: 'Pending', colorKey: 'warning' },
  active: { label: 'Active', colorKey: 'success' },
  upcoming: { label: 'Upcoming', colorKey: 'primary' },
  completed: { label: 'Completed', colorKey: 'textMuted' },
  cancelled: { label: 'Cancelled', colorKey: 'textMuted' },
  rejected:  { label: 'Rejected',  colorKey: 'textMuted' },
};

// Generate consistent color from initials
function getAvatarColor(initials: string): string {
  const colors = [
    '#0D7377', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
  ];
  const charCode = initials.charCodeAt(0) + (initials.charCodeAt(1) || 0);
  return colors[charCode % colors.length];
}

function BookingRow({
  id,
  renterName,
  renterInitials,
  listingTitle,
  start,
  end,
  status,
  amount,
  onPress,
  isLast = false,
}: BookingRowProps) {
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);
  const scale = useSharedValue(1);

  const avatarColor = useMemo(() => getAvatarColor(renterInitials), [renterInitials]);
  const statusConfig = STATUS_CONFIG[status];
  const statusColor = theme[statusConfig.colorKey];

  const handlePressIn = useCallback(() => {
    if (onPress) {
      scale.value = withSpring(0.98, { damping: 15, stiffness: 150 });
    }
  }, [onPress, scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const timeRange = formatTimeRange(start, end);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!onPress}
      accessibilityLabel={`Booking from ${renterName}, ${timeRange}, ${statusConfig.label}`}
      accessibilityRole="button"
    >
      <Animated.View
        style={[
          styles.container,
          !isLast && [styles.withBorder, { borderBottomColor: theme.borderLight }],
          animatedStyle,
        ]}
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{renterInitials}</Text>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text
            style={[styles.name, { color: theme.text }]}
            numberOfLines={1}
          >
            {renterName}
          </Text>
          <Text
            style={[styles.time, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {timeRange}
          </Text>
          <Text
            style={[styles.listing, { color: theme.textMuted }]}
            numberOfLines={1}
          >
            {listingTitle}
          </Text>
        </View>

        {/* Right Side */}
        <View style={styles.rightSide}>
          <Text style={[styles.amount, { color: theme.text }]}>
            {formatCurrency(amount)}
          </Text>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: `${statusColor}20` },
            ]}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
  },
  withBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  content: {
    flex: 1,
    marginLeft: spacing[3],
    gap: 2,
  },
  name: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  time: {
    fontSize: fontSize.xs,
  },
  listing: {
    fontSize: fontSize.xs - 1,
  },
  rightSide: {
    alignItems: 'flex-end',
    gap: spacing[1],
  },
  amount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  statusPill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: fontSize.xs - 1,
    fontWeight: fontWeight.medium as any,
  },
});

export default memo(BookingRow);
