import React, { memo, useMemo, useCallback } from 'react';
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
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../../theme/colors';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';
import type { FullBooking, BookingStatus, VehicleType } from '../../../types/models';

// Status configuration with colors
const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; bgColor: string; icon: string }> = {
  REQUESTED: { label: 'Request', color: '#D97706', bgColor: '#FFFBEB', icon: 'time-outline' },
  UPCOMING: { label: 'Upcoming', color: '#0D7377', bgColor: '#E8F5F4', icon: 'calendar-outline' },
  ACTIVE: { label: 'Active', color: '#059669', bgColor: '#ECFDF5', icon: 'car-outline' },
  COMPLETED: { label: 'Completed', color: '#6B7280', bgColor: '#F3F4F6', icon: 'checkmark-circle-outline' },
  CANCELLED: { label: 'Cancelled', color: '#DC2626', bgColor: '#FEF2F2', icon: 'close-circle-outline' },
  REJECTED: { label: 'Rejected', color: '#B91C1C', bgColor: '#FEF2F2', icon: 'close-circle-outline' },
  NO_SHOW: { label: 'No Show', color: '#7C3AED', bgColor: '#F5F3FF', icon: 'alert-circle-outline' },
};

// Vehicle type icons
const VEHICLE_ICONS: Record<VehicleType, string> = {
  CAR: 'car-outline',
  BIKE: 'bicycle-outline',
  TRUCK: 'bus-outline',
  VAN: 'car-sport-outline',
};

// Animation config
const SPRING_CONFIG = { damping: 15, stiffness: 150 };

export interface BookingCardProps {
  booking: FullBooking;
  onPress: (booking: FullBooking) => void;
  onApprove?: (booking: FullBooking) => void;
  onReject?: (booking: FullBooking) => void;
  onCancel?: (booking: FullBooking) => void;
  onCheckIn?: (booking: FullBooking) => void;
  onComplete?: (booking: FullBooking) => void;
  onNoShow?: (booking: FullBooking) => void;
  testID?: string;
}

// Format duration between two dates
function formatDuration(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const diffMs = end.getTime() - start.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

// Format time display
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// Format date display
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  if (isToday) return 'Today';
  if (isTomorrow) return 'Tomorrow';

  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function BookingCard({
  booking,
  onPress,
  onApprove,
  onReject,
  onCancel,
  onCheckIn,
  onComplete,
  onNoShow,
  testID,
}: BookingCardProps) {
  const theme = useMemo(() => getTheme(false), []);
  const statusConfig = STATUS_CONFIG[booking.status];

  // Press animation
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, SPRING_CONFIG);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, SPRING_CONFIG);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Format price
  const priceText = `₹${booking.priceTotal.toLocaleString('en-IN')}`;

  // Determine action buttons based on status
  const showApproveReject = booking.status === 'REQUESTED';
  const showCancel = booking.status === 'UPCOMING';
  const showCompleteNoShow = booking.status === 'ACTIVE';
  const hasActions = showApproveReject || showCancel || showCompleteNoShow;

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={() => onPress(booking)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.container, { backgroundColor: theme.surface }]}
        testID={testID}
      >
        {/* Header Row: Status + Price */}
        <View style={styles.headerRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
            <Ionicons name={statusConfig.icon} size={14} color={statusConfig.color} />
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
          <View style={styles.priceContainer}>
            <Text style={[styles.priceText, { color: theme.text }]}>{priceText}</Text>
            <Text style={[styles.priceLabel, { color: theme.textMuted }]}>
              {booking.status === 'REQUESTED' ? 'Estimated' : 'Total'}
            </Text>
          </View>
        </View>

        {/* Listing Name */}
        <Text style={[styles.listingName, { color: theme.text }]} numberOfLines={1}>
          {booking.listingName}
        </Text>

        {/* Address */}
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={14} color={theme.textSecondary} />
          <Text style={[styles.addressText, { color: theme.textSecondary }]} numberOfLines={1}>
            {booking.addressLine}
          </Text>
        </View>

        {/* Time Row */}
        <View style={[styles.timeRow, { backgroundColor: theme.borderLight }]}>
          <View style={styles.timeBlock}>
            <Text style={[styles.timeLabel, { color: theme.textMuted }]}>Start</Text>
            <Text style={[styles.timeValue, { color: theme.text }]}>{formatTime(booking.startAt)}</Text>
            <Text style={[styles.dateValue, { color: theme.textSecondary }]}>{formatDate(booking.startAt)}</Text>
          </View>
          <View style={styles.timeDivider}>
            <Ionicons name="arrow-forward" size={16} color={theme.textMuted} />
            <Text style={[styles.durationText, { color: theme.primary }]}>
              {formatDuration(booking.startAt, booking.endAt)}
            </Text>
          </View>
          <View style={styles.timeBlock}>
            <Text style={[styles.timeLabel, { color: theme.textMuted }]}>End</Text>
            <Text style={[styles.timeValue, { color: theme.text }]}>{formatTime(booking.endAt)}</Text>
            <Text style={[styles.dateValue, { color: theme.textSecondary }]}>{formatDate(booking.endAt)}</Text>
          </View>
        </View>

        {/* Renter & Vehicle Info */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Ionicons name="person-outline" size={14} color={theme.textSecondary} />
            <Text style={[styles.infoText, { color: theme.textSecondary }]} numberOfLines={1}>
              {booking.renterName}
            </Text>
            {booking.flags.verified && (
              <Ionicons name="checkmark-circle" size={14} color={theme.success} style={styles.verifiedIcon} />
            )}
          </View>
          <View style={styles.infoItem}>
            <Ionicons name={VEHICLE_ICONS[booking.vehicle.type]} size={14} color={theme.textSecondary} />
            <Text style={[styles.infoText, { color: theme.textSecondary }]}>
              {booking.vehicle.plate}
            </Text>
          </View>
        </View>

        {/* Flags */}
        {(booking.flags.peakPricingApplied || booking.flags.requiresPermit) && (
          <View style={styles.flagsRow}>
            {booking.flags.peakPricingApplied && (
              <View style={[styles.flagChip, { backgroundColor: theme.warningLight }]}>
                <Ionicons name="trending-up" size={12} color={theme.warning} />
                <Text style={[styles.flagText, { color: theme.warning }]}>Peak</Text>
              </View>
            )}
            {booking.flags.requiresPermit && (
              <View style={[styles.flagChip, { backgroundColor: theme.primaryLight }]}>
                <Ionicons name="document-text-outline" size={12} color={theme.primary} />
                <Text style={[styles.flagText, { color: theme.primary }]}>Permit</Text>
              </View>
            )}
          </View>
        )}

        {/* Notes (for cancelled/no-show) */}
        {booking.notes && (
          <View style={[styles.notesRow, { backgroundColor: theme.borderLight }]}>
            <Ionicons name="information-circle-outline" size={14} color={theme.textMuted} />
            <Text style={[styles.notesText, { color: theme.textMuted }]} numberOfLines={1}>
              {booking.notes}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        {hasActions && (
          <View style={[styles.actionRow, { borderTopColor: theme.borderLight }]}>
            {showApproveReject && (
              <>
                <Pressable
                  onPress={() => onReject?.(booking)}
                  style={[styles.actionButton, styles.secondaryButton, { borderColor: theme.danger }]}
                >
                  <Ionicons name="close" size={18} color={theme.danger} />
                  <Text style={[styles.actionButtonText, { color: theme.danger }]}>Reject</Text>
                </Pressable>
                <Pressable
                  onPress={() => onApprove?.(booking)}
                  style={[styles.actionButton, styles.primaryButton, { backgroundColor: theme.success }]}
                >
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  <Text style={[styles.actionButtonText, { color: '#FFFFFF' }]}>Approve</Text>
                </Pressable>
              </>
            )}
            {showCancel && (
              <>
                <Pressable
                  onPress={() => onCancel?.(booking)}
                  style={[styles.actionButton, styles.secondaryButton, { borderColor: theme.danger }]}
                >
                  <Ionicons name="close-circle-outline" size={18} color={theme.danger} />
                  <Text style={[styles.actionButtonText, { color: theme.danger }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => onCheckIn?.(booking)}
                  style={[styles.actionButton, styles.primaryButton, { backgroundColor: theme.primary }]}
                >
                  <Ionicons name="log-in-outline" size={18} color="#FFFFFF" />
                  <Text style={[styles.actionButtonText, { color: '#FFFFFF' }]}>Check In</Text>
                </Pressable>
              </>
            )}
            {showCompleteNoShow && (
              <>
                <Pressable
                  onPress={() => onNoShow?.(booking)}
                  style={[styles.actionButton, styles.secondaryButton, { borderColor: theme.warning }]}
                >
                  <Ionicons name="alert-circle-outline" size={18} color={theme.warning} />
                  <Text style={[styles.actionButtonText, { color: theme.warning }]}>No-show</Text>
                </Pressable>
                <Pressable
                  onPress={() => onComplete?.(booking)}
                  style={[styles.actionButton, styles.primaryButton, { backgroundColor: theme.success }]}
                >
                  <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
                  <Text style={[styles.actionButtonText, { color: '#FFFFFF' }]}>Complete</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.xl,
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    padding: spacing[4],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[2],
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    gap: 4,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  priceText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as any,
  },
  priceLabel: {
    fontSize: fontSize.xs,
  },
  listingName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[1],
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[3],
    gap: 4,
  },
  addressText: {
    fontSize: fontSize.sm,
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[3],
  },
  timeBlock: {
    alignItems: 'center',
    flex: 1,
  },
  timeLabel: {
    fontSize: fontSize.xs,
    marginBottom: 2,
  },
  timeValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  dateValue: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  timeDivider: {
    alignItems: 'center',
    paddingHorizontal: spacing[2],
  },
  durationText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  infoText: {
    fontSize: fontSize.sm,
    flex: 1,
  },
  verifiedIcon: {
    marginLeft: 2,
  },
  flagsRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  flagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    gap: 4,
  },
  flagText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  notesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[2],
    borderRadius: borderRadius.md,
    marginBottom: spacing[2],
    gap: spacing[2],
  },
  notesText: {
    fontSize: fontSize.xs,
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[2],
    paddingTop: spacing[3],
    marginTop: spacing[2],
    borderTopWidth: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.lg,
    gap: 4,
    minWidth: 100,
  },
  primaryButton: {
    // backgroundColor set inline
  },
  secondaryButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  actionButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
});

export default memo(BookingCard);
