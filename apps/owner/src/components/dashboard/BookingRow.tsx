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
import { palette, radii, fonts } from '../../theme/kit';
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

// Status pill tones, matching the kit's StatusTag (bg / fg).
const STATUS_CONFIG: Record<BookingStatus, { label: string; bg: string; fg: string }> = {
  request: { label: 'Pending', bg: palette.warningSoft, fg: palette.warning },
  active: { label: 'Active', bg: palette.ink, fg: palette.textInverse },
  upcoming: { label: 'Upcoming', bg: palette.blueSoft, fg: palette.text },
  completed: { label: 'Completed', bg: palette.fill, fg: palette.textMuted },
  cancelled: { label: 'Cancelled', bg: palette.fill, fg: palette.textMuted },
  rejected:  { label: 'Rejected',  bg: palette.fill, fg: palette.textMuted },
};

// Consistent soft avatar tone from initials
function getAvatarColor(initials: string): string {
  const colors = [palette.peachSoft, palette.blueSoft, palette.fill, palette.peachWash];
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
              { backgroundColor: statusConfig.bg },
            ]}
          >
            <Text style={[styles.statusText, { color: statusConfig.fg }]}>
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
    paddingVertical: 14,
  },
  withBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    ...fonts.bold,
    color: palette.text,
    fontSize: 15,
  },
  content: {
    flex: 1,
    marginLeft: 12,
    gap: 2,
  },
  name: {
    ...fonts.semibold,
    fontSize: 15.5,
  },
  time: {
    ...fonts.medium,
    fontSize: 12.5,
  },
  listing: {
    ...fonts.medium,
    fontSize: 12,
  },
  rightSide: {
    alignItems: 'flex-end',
    gap: 6,
  },
  amount: {
    ...fonts.bold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  statusText: {
    ...fonts.semibold,
    fontSize: 11,
  },
});

export default memo(BookingRow);
