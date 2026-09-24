import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, radii, fonts } from '../../../theme/kit';
import { PillButton, StatusTag, IsoBlock } from '../../../components/ui';
import type { FullBooking, BookingStatus, VehicleType } from '../../../types/models';

type Tone = 'peach' | 'blue' | 'grey';
type TagTone = 'ink' | 'warning' | 'success' | 'danger' | 'grey';

// Status → label, tag tone, card tone and position on the 4-step track
// (Requested → Approved → Parked → Done). Finished bookings fill the track.
const STATUS_CONFIG: Record<BookingStatus, { label: string; tag: TagTone; tone: Tone; step: number }> = {
  REQUESTED: { label: 'Request', tag: 'warning', tone: 'peach', step: 0 },
  UPCOMING: { label: 'Upcoming', tag: 'ink', tone: 'blue', step: 1 },
  ACTIVE: { label: 'Active', tag: 'ink', tone: 'peach', step: 2 },
  COMPLETED: { label: 'Completed', tag: 'grey', tone: 'grey', step: 4 },
  CANCELLED: { label: 'Cancelled', tag: 'danger', tone: 'grey', step: 4 },
  REJECTED: { label: 'Rejected', tag: 'danger', tone: 'grey', step: 4 },
  NO_SHOW: { label: 'No Show', tag: 'danger', tone: 'grey', step: 4 },
};

const TONE_BG: Record<Tone, string> = {
  peach: palette.peachSoft,
  blue: palette.blueSoft,
  grey: palette.surface,
};

// Vehicle type icons
const VEHICLE_ICONS: Record<VehicleType, string> = {
  CAR: 'car-outline',
  BIKE: 'bicycle-outline',
  TRUCK: 'bus-outline',
  VAN: 'car-sport-outline',
};

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
  const statusConfig = STATUS_CONFIG[booking.status];
  const tone = statusConfig.tone;

  // Format price
  const priceText = `₹${booking.priceTotal.toLocaleString('en-IN')}`;

  // Determine action buttons based on status
  const showApproveReject = booking.status === 'REQUESTED';
  const showCancel = booking.status === 'UPCOMING';
  const showCompleteNoShow = booking.status === 'ACTIVE';
  const hasActions = showApproveReject || showCancel || showCompleteNoShow;

  return (
    <TouchableOpacity
      onPress={() => onPress(booking)}
      activeOpacity={0.9}
      style={[styles.container, { backgroundColor: TONE_BG[tone] }]}
      testID={testID}
    >
      <View style={styles.art} pointerEvents="none">
        <IsoBlock size={132} tone={tone} />
      </View>

      <View style={styles.body}>
        <View style={styles.tagRow}>
          <StatusTag label={statusConfig.label} tone={statusConfig.tag} />
          {booking.flags.peakPricingApplied && (
            <StatusTag label="Peak" tone="white" style={styles.tagGap} />
          )}
          {booking.flags.requiresPermit && (
            <StatusTag label="Permit" tone="white" style={styles.tagGap} />
          )}
        </View>
        <Text style={styles.ref} numberOfLines={1}>
          #{booking.id.slice(-6).toUpperCase()}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.metaTitle} numberOfLines={1}>{booking.listingName}</Text>
            <Text style={styles.metaSub} numberOfLines={1}>{formatDate(booking.startAt)}</Text>
          </View>
          <View style={styles.metaColRight}>
            <Text style={styles.metaTitle}>{priceText}</Text>
            <Text style={styles.metaSub}>{formatTime(booking.startAt)}</Text>
          </View>
        </View>
      </View>

      {/* Guest + vehicle */}
      <View style={styles.guestRow}>
        <View style={[styles.guestPill, tone === 'grey' && styles.guestPillGrey]}>
          <Ionicons name="person-outline" size={13} color={palette.text} />
          <Text style={styles.guestText} numberOfLines={1}>{booking.renterName}</Text>
          {booking.flags.verified && (
            <Ionicons name="checkmark-circle" size={13} color={palette.success} style={styles.verifiedIcon} />
          )}
        </View>
        <View style={[styles.guestPill, tone === 'grey' && styles.guestPillGrey]}>
          <Ionicons name={VEHICLE_ICONS[booking.vehicle.type]} size={13} color={palette.text} />
          <Text style={styles.guestText} numberOfLines={1}>{booking.vehicle.plate}</Text>
        </View>
        <View style={[styles.guestPill, tone === 'grey' && styles.guestPillGrey]}>
          <Ionicons name="time-outline" size={13} color={palette.text} />
          <Text style={styles.guestText}>{formatDuration(booking.startAt, booking.endAt)}</Text>
        </View>
      </View>

      {/* Notes (for cancelled/no-show) */}
      {booking.notes && (
        <View style={styles.notesRow}>
          <Ionicons name="information-circle-outline" size={14} color={palette.textMuted} />
          <Text style={styles.notesText} numberOfLines={1}>
            {booking.notes}
          </Text>
        </View>
      )}

      {/* Action pills */}
      {hasActions && (
        <View style={styles.actionRow}>
          {showApproveReject && (
            <>
              <PillButton
                size="sm"
                variant="ink"
                icon="check"
                label="Approve"
                onPress={() => onApprove?.(booking)}
                style={styles.actionBtn}
              />
              <PillButton
                size="sm"
                variant="white"
                icon="x"
                label="Reject"
                onPress={() => onReject?.(booking)}
                style={styles.actionBtn}
              />
            </>
          )}
          {showCancel && (
            <>
              <PillButton
                size="sm"
                variant="ink"
                icon="log-in"
                label="Check In"
                onPress={() => onCheckIn?.(booking)}
                style={styles.actionBtn}
              />
              <PillButton
                size="sm"
                variant="danger"
                icon="x"
                label="Cancel"
                onPress={() => onCancel?.(booking)}
                style={styles.actionBtn}
              />
            </>
          )}
          {showCompleteNoShow && (
            <>
              <PillButton
                size="sm"
                variant="ink"
                icon="check-circle"
                label="Complete"
                onPress={() => onComplete?.(booking)}
                style={styles.actionBtn}
              />
              <PillButton
                size="sm"
                variant="white"
                icon="alert-circle"
                label="No-show"
                onPress={() => onNoShow?.(booking)}
                style={styles.actionBtn}
              />
            </>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.xl,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 18,
    overflow: 'hidden',
  },
  art: { position: 'absolute', right: -30, top: 30 },
  body: { width: '66%' },
  tagRow: { flexDirection: 'row', alignItems: 'center' },
  tagGap: { marginLeft: 6 },
  ref: { ...fonts.bold, fontSize: 23, letterSpacing: -0.5, color: palette.text, marginTop: 12 },
  track: { marginTop: 14 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  metaCol: { maxWidth: '58%' },
  metaColRight: { alignItems: 'flex-end' },
  metaTitle: { ...fonts.semibold, fontSize: 13.5, color: palette.text },
  metaSub: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 2 },
  guestRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  guestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    paddingHorizontal: 11,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.7)',
    marginRight: 6,
    marginBottom: 6,
    maxWidth: '60%',
  },
  guestPillGrey: { backgroundColor: palette.fill },
  guestText: { ...fonts.semibold, fontSize: 12, color: palette.text, marginLeft: 5, flexShrink: 1 },
  verifiedIcon: { marginLeft: 4 },
  notesRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  notesText: { ...fonts.medium, flex: 1, fontSize: 12.5, color: palette.textMuted, marginLeft: 6 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  actionBtn: { marginRight: 8, marginBottom: 4 },
});

export default memo(BookingCard);
