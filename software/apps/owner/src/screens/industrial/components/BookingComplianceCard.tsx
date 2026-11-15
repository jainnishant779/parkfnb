// ============================================================================
// BOOKING COMPLIANCE CARD - Individual Booking Display
// ============================================================================

import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';
import type {
  BookingCompliance,
  BookingComplianceStatus,
} from '../../../types/compliance';
import {
  STATUS_COLORS,
  VEHICLE_TYPE_LABELS,
  SLOT_TIER_LABELS,
} from '../../../types/compliance';
import {
  deriveBookingStatus,
  getCompletionProgress,
  formatTimeRange,
} from '../../../services/complianceStorage';

// ============================================================================
// TYPES
// ============================================================================

interface BookingComplianceCardProps {
  booking: BookingCompliance;
  onPress: (booking: BookingCompliance) => void;
  testID?: string;
}

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

interface StatusBadgeProps {
  status: BookingComplianceStatus;
}

const StatusBadge = memo(function StatusBadge({ status }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status];
  const labels: Record<BookingComplianceStatus, string> = {
    missing: 'Missing',
    expiring: 'Expiring',
    pending: 'Pending',
    compliant: 'Compliant',
  };

  return (
    <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: colors.dot }]} />
      <Text style={[styles.statusText, { color: colors.text }]}>
        {labels[status]}
      </Text>
    </View>
  );
});

// ============================================================================
// PROGRESS BAR COMPONENT
// ============================================================================

interface ProgressBarProps {
  completed: number;
  total: number;
}

const ProgressBar = memo(function ProgressBar({ completed, total }: ProgressBarProps) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  const isComplete = completed === total && total > 0;

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressBarBg}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${percentage}%`,
              backgroundColor: isComplete ? '#10B981' : '#0D7377',
            },
          ]}
        />
      </View>
      <Text style={styles.progressText}>
        {completed}/{total} complete
      </Text>
    </View>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function BookingComplianceCard({
  booking,
  onPress,
  testID,
}: BookingComplianceCardProps) {
  const status = useMemo(() => deriveBookingStatus(booking), [booking]);
  const progress = useMemo(() => getCompletionProgress(booking), [booking]);
  const timeRange = useMemo(
    () => formatTimeRange(booking.startAt, booking.endAt),
    [booking.startAt, booking.endAt]
  );

  return (
    <Pressable
      onPress={() => onPress(booking)}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Booking ${booking.bookingRef}, ${status} status`}
      testID={testID}
    >
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.bookingRef}>{booking.bookingRef}</Text>
          {booking.flagged && (
            <Ionicons
              name="flag"
              size={14}
              color="#EF4444"
              style={styles.flagIcon}
            />
          )}
        </View>
        <StatusBadge status={status} />
      </View>

      {/* Client Info */}
      <Text style={styles.clientName}>{booking.clientName}</Text>
      {booking.clientCompany && (
        <Text style={styles.companyName}>{booking.clientCompany}</Text>
      )}

      {/* Details Row */}
      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Ionicons name="calendar-outline" size={14} color="#64748B" />
          <Text style={styles.detailText}>{timeRange}</Text>
        </View>
        <View style={styles.detailItem}>
          <Ionicons name="car-outline" size={14} color="#64748B" />
          <Text style={styles.detailText}>
            {VEHICLE_TYPE_LABELS[booking.vehicleType]}
          </Text>
        </View>
        <View style={styles.detailItem}>
          <Ionicons name="resize-outline" size={14} color="#64748B" />
          <Text style={styles.detailText}>
            {SLOT_TIER_LABELS[booking.slotTier]}
          </Text>
        </View>
      </View>

      {/* Progress */}
      <ProgressBar completed={progress.completed} total={progress.total} />
    </Pressable>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[5],
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  pressed: {
    opacity: 0.95,
    transform: [{ scale: 0.995 }],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bookingRef: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    color: '#1E293B',
  },
  flagIcon: {
    marginLeft: spacing[2],
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  clientName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#1E293B',
  },
  companyName: {
    fontSize: fontSize.xs,
    color: '#64748B',
    marginTop: 2,
  },
  detailsRow: {
    flexDirection: 'row',
    marginTop: spacing[3],
    gap: spacing[3],
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: fontSize.xs,
    color: '#64748B',
  },
  progressContainer: {
    marginTop: spacing[3],
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: fontSize.xs,
    color: '#94A3B8',
    marginTop: 4,
  },
});

export default memo(BookingComplianceCard);
