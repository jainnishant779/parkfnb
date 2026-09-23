import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, radii, fonts } from '../../theme/kit';
import {
  PillButton,
  IconCircle,
  ScreenHeader,
  StatusTag,
  ProgressTrack,
  InfoGrid,
  TimelineItem,
  ContactCard,
  EmptyState,
  IsoBlock,
} from '../../components/ui';
import type { RootStackScreenProps } from '../../navigation/types';
import { bookingService } from '../../services/bookingService';
import { transformBooking, getRefundPolicy, getCheckInWindow, formatBookingDate, formatBookingTime } from '../../utils/bookingTransform';
import type { ApiBooking } from '../../types/api';
import type { FullBooking } from '../../types/models';

type Props = RootStackScreenProps<'BookingDetails'>;
type TagTone = 'ink' | 'warning' | 'success' | 'danger' | 'grey';

// ─── Status helpers ───────────────────────────────────────────────────────────

function getStatusTone(status: FullBooking['status']): TagTone {
  switch (status) {
    case 'REQUESTED':  return 'warning';
    case 'UPCOMING':   return 'ink';
    case 'ACTIVE':     return 'ink';
    case 'COMPLETED':  return 'grey';
    case 'CANCELLED':  return 'danger';
    case 'REJECTED':   return 'danger';
    case 'NO_SHOW':    return 'danger';
    default:           return 'grey';
  }
}

function getStatusLabel(status: FullBooking['status']): string {
  switch (status) {
    case 'REQUESTED':  return 'Pending Approval';
    case 'UPCOMING':   return 'Upcoming';
    case 'ACTIVE':     return 'Active';
    case 'COMPLETED':  return 'Completed';
    case 'CANCELLED':  return 'Cancelled';
    case 'REJECTED':   return 'Rejected';
    case 'NO_SHOW':    return 'No Show';
    default:           return status;
  }
}

// Position on the 4-step track (Requested → Approved → Parked → Done).
function getTrackStep(status: FullBooking['status']): number {
  switch (status) {
    case 'REQUESTED': return 0;
    case 'UPCOMING':  return 1;
    case 'ACTIVE':    return 2;
    default:          return 4;
  }
}

function getPaymentLabel(paymentStatus: ApiBooking['paymentStatus']): { label: string; tone: TagTone } {
  switch (paymentStatus) {
    case 'paid':               return { label: 'Paid', tone: 'success' };
    case 'pending':            return { label: 'Pending', tone: 'warning' };
    case 'failed':             return { label: 'Failed', tone: 'danger' };
    case 'refunded':           return { label: 'Refunded', tone: 'grey' };
    case 'partially_refunded': return { label: 'Partial Refund', tone: 'grey' };
    default:                   return { label: paymentStatus, tone: 'grey' };
  }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BookingDetailsScreen({ route, navigation }: Props) {
  const { bookingId } = route.params;
  const insets = useSafeAreaInsets();

  const [rawBooking, setRawBooking] = useState<ApiBooking | null>(null);
  const [booking, setBooking] = useState<FullBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBooking = useCallback(async () => {
    try {
      setError(null);
      const { booking: raw } = await bookingService.getBookingById(bookingId);
      setRawBooking(raw);
      setBooking(transformBooking(raw));
    } catch (err: any) {
      if (err?.http === 404) {
        setError('Booking not found.');
      } else if (err?.http === 403) {
        setError('You do not have access to this booking.');
      } else {
        setError('Failed to load booking. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  // Refresh whenever this screen comes into focus (e.g. navigating back from AccessPass)
  useFocusEffect(
    useCallback(() => {
      fetchBooking();
    }, [fetchBooking])
  );

  // ─── Action handlers ─────────────────────────────────────────────────────

  const runAction = useCallback(async (action: () => Promise<void>) => {
    setActionLoading(true);
    try {
      await action();
      await fetchBooking();
    } catch (err: any) {
      const msg = err?.message || 'Action failed. Please try again.';
      AppAlert.alert('Error', msg);
    } finally {
      setActionLoading(false);
    }
  }, [fetchBooking]);

  // Acts directly rather than behind a confirmation: the alert component does
  // not present on this build, which left the button doing nothing at all.
  // Approving is reversible — the booking can still be cancelled.
  const handleApprove = useCallback(() => {
    runAction(async () => {
      await bookingService.approveBooking(bookingId);
    });
  }, [bookingId, runAction]);

  const handleReject = useCallback(() => {
    runAction(async () => {
      await bookingService.rejectBooking(bookingId);
    });
  }, [bookingId, runAction]);

  const handleCancel = useCallback(() => {
    if (!booking) return;
    const { label } = getRefundPolicy(booking.startAt);
    AppAlert.alert('Cancel Booking', `Are you sure you want to cancel this booking?\n\n${label}`, [
      { text: 'Keep Booking', style: 'cancel' },
      {
        text: 'Cancel Booking', style: 'destructive', onPress: async () => {
          setActionLoading(true);
          try {
            const result = await bookingService.cancelBooking(bookingId);
            await fetchBooking();
            if (result.refund && result.refund.amount > 0) {
              AppAlert.alert(
                'Booking Cancelled',
                `A refund of ₹${result.refund.amount.toFixed(2)} (${result.refund.percentage}%) will be processed.`,
              );
            }
          } catch (err: any) {
            AppAlert.alert('Error', err?.message || 'Cancellation failed. Please try again.');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  }, [bookingId, booking, fetchBooking]);

  const handleCheckIn = useCallback(() => {
    setActionLoading(true);
    bookingService.checkInBooking(bookingId)
      .then(() => fetchBooking())
      .catch((err: any) => {
        const code: string = err?.code || '';
        if (code === 'BIZ_CHECKIN_TOO_EARLY') {
          if (booking) {
            const win = getCheckInWindow(booking.startAt);
            const opensAt = formatBookingTime(win.opensAt);
            AppAlert.alert('Too Early', `Check-in window opens at ${opensAt}.`);
          } else {
            AppAlert.alert('Too Early', 'Check-in window has not opened yet.');
          }
        } else if (code === 'BIZ_CHECKIN_WINDOW_PASSED') {
          // Backend auto-marked the booking as no-show — refresh to reflect new status
          AppAlert.alert('Check-In Window Passed', 'The check-in window has passed. This booking has been marked as no-show.');
          fetchBooking();
        } else {
          AppAlert.alert('Error', err?.message || 'Check-in failed. Please try again.');
        }
      })
      .finally(() => setActionLoading(false));
  }, [bookingId, booking, fetchBooking]);

  const handleCheckOut = useCallback(() => {
    AppAlert.alert('Check Out', 'Check out the renter? Overtime charges (1.5×) apply if past end time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Check Out', onPress: () => {
          setActionLoading(true);
          bookingService.checkOutBooking(bookingId)
            .then((result) => {
              if (result.overtime) {
                AppAlert.alert(
                  'Overtime Charged',
                  `₹${result.overtime.charge.toFixed(2)} overtime charge applied at 1.5× hourly rate.`,
                );
              }
              return fetchBooking();
            })
            .catch((err: any) => {
              AppAlert.alert('Error', err?.message || 'Check-out failed. Please try again.');
            })
            .finally(() => setActionLoading(false));
        },
      },
    ]);
  }, [bookingId, fetchBooking]);

  const handleMarkNoShow = useCallback(() => {
    AppAlert.alert('Mark No-Show', 'Mark this renter as a no-show?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark No-Show', style: 'destructive', onPress: () => runAction(async () => {
          await bookingService.markNoShow(bookingId);
        }),
      },
    ]);
  }, [bookingId, runAction]);

  const handleViewPass = useCallback(() => {
    navigation.navigate('AccessPass', { bookingId });
  }, [navigation, bookingId]);

  const handleCallRenter = useCallback((phone: string) => {
    Linking.openURL(`tel:${phone}`);
  }, []);

  // ─── Loading / Error states ──────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor={palette.bgCream} />
        <ScreenHeader title="Details" onBack={() => navigation.goBack()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.ink} />
        </View>
      </View>
    );
  }

  if (error || !booking || !rawBooking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor={palette.bgCream} />
        <ScreenHeader title="Details" onBack={() => navigation.goBack()} />
        <View style={styles.errorContainer}>
          <EmptyState
            tone="grey"
            title={error || 'Something went wrong.'}
            action="Try Again"
            onAction={fetchBooking}
          />
        </View>
      </View>
    );
  }

  // ─── Derived display values ──────────────────────────────────────────────

  const paymentInfo  = getPaymentLabel(rawBooking.paymentStatus);
  const checkInWindow = booking.status === 'UPCOMING' ? getCheckInWindow(booking.startAt) : null;

  const startDate = formatBookingDate(booking.startAt);
  const startTime = formatBookingTime(booking.startAt);
  const endDate   = formatBookingDate(booking.endAt);
  const endTime   = formatBookingTime(booking.endAt);

  const durationLabel = rawBooking.durationHours === 1
    ? '1 hour'
    : `${rawBooking.durationHours % 1 === 0 ? rawBooking.durationHours : rawBooking.durationHours.toFixed(1)} hours`;

  const refundPolicy = booking.status === 'UPCOMING' ? getRefundPolicy(booking.startAt) : null;

  // Timeline built only from timestamps the API returned, newest first.
  const timeline: { key: string; title: string; subtitle?: string; at?: string }[] = [
    {
      key: 'created',
      title: rawBooking.bookingMode === 'instant' ? 'Instant booking received' : 'Booking request received',
      subtitle: rawBooking.bookingMode === 'instant' ? 'Instant Booking' : 'Request-based',
      at: booking.createdAt,
    },
  ];
  if (['UPCOMING', 'ACTIVE', 'COMPLETED'].includes(booking.status) || rawBooking.checkInTime) {
    timeline.push({
      key: 'confirmed',
      title: 'Booking confirmed',
      subtitle: `Scheduled for ${startDate} · ${startTime}`,
      at: rawBooking.bookingMode === 'instant' ? booking.createdAt : undefined,
    });
  }
  if (rawBooking.checkInTime) {
    timeline.push({ key: 'checkin', title: 'Checked in', subtitle: booking.addressLine, at: rawBooking.checkInTime });
  }
  if (rawBooking.checkOutTime) {
    timeline.push({ key: 'checkout', title: 'Checked out', subtitle: `Ends ${endDate} · ${endTime}`, at: rawBooking.checkOutTime });
  }
  if (['CANCELLED', 'REJECTED', 'NO_SHOW'].includes(booking.status)) {
    timeline.push({
      key: 'ended',
      title: getStatusLabel(booking.status),
      subtitle: booking.notes ? `Cancellation reason: ${booking.notes}` : undefined,
      at: rawBooking.updatedAt,
    });
  }
  timeline.reverse();

  // ─── Footer action buttons by status ────────────────────────────────────

  const renderFooterActions = () => {
    const footerStyle = [styles.footer, { paddingBottom: insets.bottom + 12 }];
    if (actionLoading) {
      return (
        <View style={footerStyle}>
          <ActivityIndicator size="small" color={palette.ink} style={styles.footerLoader} />
        </View>
      );
    }

    switch (booking.status) {
      case 'REQUESTED':
        return (
          <View style={footerStyle}>
            <PillButton variant="ink" icon="check" label="Approve" onPress={handleApprove} style={styles.footerMain} />
            <PillButton variant="grey" icon="x" label="Reject" onPress={handleReject} style={styles.footerSide} />
          </View>
        );
      case 'UPCOMING':
        return (
          <View style={footerStyle}>
            <PillButton variant="ink" icon="log-in" label="Check In" onPress={handleCheckIn} style={styles.footerMain} />
            <PillButton variant="grey" icon="grid" label="Pass" onPress={handleViewPass} style={styles.footerSide} />
            <IconCircle icon="x" size={58} variant="grey" color={palette.danger} onPress={handleCancel} />
          </View>
        );
      case 'ACTIVE':
        return (
          <View style={footerStyle}>
            <PillButton variant="ink" icon="log-out" label="Check Out" onPress={handleCheckOut} style={styles.footerMain} />
            <PillButton variant="grey" icon="alert-circle" label="No-Show" onPress={handleMarkNoShow} style={styles.footerSide} />
          </View>
        );
      default:
        return null;
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bgCream} />

      <ScreenHeader title="Details" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryArt} pointerEvents="none">
            <IsoBlock size={150} tone="peach" />
          </View>
          <View style={styles.summaryTop}>
            <View style={styles.flex}>
              <Text style={styles.gridLabelStrong}>Booking id</Text>
              <Text style={styles.summaryRef} numberOfLines={1}>#{rawBooking.bookingNumber}</Text>
            </View>
            <View style={styles.statusCol}>
              <Text style={styles.gridLabelStrong}>Status</Text>
              <StatusTag
                label={getStatusLabel(booking.status)}
                tone={getStatusTone(booking.status)}
                style={styles.statusTagGap}
              />
            </View>
          </View>
          <ProgressTrack steps={4} current={getTrackStep(booking.status)} style={styles.summaryTrack} />
          <InfoGrid
            style={styles.summaryGrid}
            items={[
              { label: 'Parking', value: booking.listingName },
              { label: 'Mode', value: rawBooking.bookingMode === 'instant' ? 'Instant Booking' : 'Request-based' },
              { label: 'Start', value: startDate, sub: startTime },
              { label: 'End', value: endDate, sub: endTime },
              { label: 'Duration', value: durationLabel },
              { label: 'Vehicle', value: `${booking.vehicle.type} · ${booking.vehicle.plate}` },
            ]}
          />
        </View>

        {/* Sheet: timeline, guest, payment */}
        <View style={styles.detailSheet}>
          <View style={styles.grabber} />
          <Text style={styles.sheetLead}>
            Booked on {formatBookingDate(booking.createdAt)} at {formatBookingTime(booking.createdAt)}
          </Text>

          {checkInWindow && (
            <View style={styles.windowBanner}>
              <Ionicons name="information-circle-outline" size={16} color={palette.text} />
              <Text style={styles.windowText}>
                Check-in window: {formatBookingTime(checkInWindow.opensAt)} – {formatBookingTime(checkInWindow.closesAt)}
              </Text>
            </View>
          )}

          {timeline.map((ev, i) => (
            <TimelineItem
              key={ev.key}
              title={ev.title}
              subtitle={ev.subtitle}
              date={ev.at ? formatBookingDate(ev.at) : null}
              time={ev.at ? formatBookingTime(ev.at) : null}
              active={i === 0}
              isLast={i === timeline.length - 1}
            >
              {i === 0 ? (
                <View style={styles.placeCard}>
                  <View style={styles.placeIcon}>
                    <Ionicons name="business-outline" size={20} color={palette.text} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.placeName} numberOfLines={1}>{booking.listingName}</Text>
                    <Text style={styles.placeAddr} numberOfLines={1}>{booking.addressLine}</Text>
                  </View>
                </View>
              ) : null}
            </TimelineItem>
          ))}

          {/* Guest */}
          <Text style={styles.sheetSection}>Guest</Text>
          <ContactCard
            name={booking.renterName}
            subtitle={booking.renterPhone || 'No phone on file'}
            onCall={booking.renterPhone ? () => handleCallRenter(booking.renterPhone!) : undefined}
            style={styles.contactCard}
          />

          {/* Payment */}
          <Text style={styles.sheetSection}>Payment</Text>
          <View style={styles.payCard}>
            <View style={styles.payLine}>
              <Text style={styles.payLabel}>Base Price</Text>
              <Text style={styles.payValue}>₹{rawBooking.basePrice.toFixed(2)}</Text>
            </View>
            {rawBooking.discountAmount > 0 && (
              <View style={styles.payLine}>
                <Text style={styles.payLabel}>Discount</Text>
                <Text style={[styles.payValue, styles.payDiscount]}>
                  -₹{rawBooking.discountAmount.toFixed(2)}
                </Text>
              </View>
            )}
            <View style={styles.payDivider} />
            <View style={styles.payLine}>
              <Text style={styles.payTotalLabel}>Total</Text>
              <Text style={styles.payTotalValue}>₹{rawBooking.totalAmount.toFixed(2)}</Text>
            </View>
            <View style={styles.payStatusRow}>
              <Text style={styles.payLabel}>Payment</Text>
              <StatusTag label={paymentInfo.label} tone={paymentInfo.tone} />
            </View>
          </View>

          {/* Cancellation Policy (UPCOMING only) */}
          {refundPolicy && (
            <View style={styles.policyRow}>
              <Ionicons name="shield-checkmark-outline" size={16} color={palette.textMuted} />
              <Text style={styles.policyText}>{refundPolicy.label}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky footer actions */}
      {renderFooterActions()}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bgCream,
  },
  flex: { flex: 1 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  // Summary card
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    padding: 20,
    overflow: 'hidden',
  },
  summaryArt: { position: 'absolute', right: -34, top: 70 },
  summaryTop: { flexDirection: 'row' },
  statusCol: { alignItems: 'flex-start' },
  statusTagGap: { marginTop: 6 },
  gridLabelStrong: { ...fonts.semibold, fontSize: 12.5, color: palette.text },
  summaryRef: {
    ...fonts.bold,
    fontSize: 24,
    letterSpacing: -0.5,
    color: palette.text,
    marginTop: 4,
    marginRight: 8,
  },
  summaryTrack: { marginTop: 16, width: '66%' },
  summaryGrid: { marginTop: 18, width: '72%' },
  // Sheet
  detailSheet: {
    flex: 1,
    marginTop: 14,
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginBottom: 16,
  },
  sheetLead: {
    ...fonts.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.textMuted,
    marginBottom: 18,
  },
  windowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: radii.lg,
    backgroundColor: palette.peachSoft,
    marginBottom: 18,
  },
  windowText: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 13,
    color: palette.text,
    marginLeft: 8,
  },
  placeCard: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    paddingRight: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.line,
  },
  placeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.peachSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  placeName: { ...fonts.bold, fontSize: 14, color: palette.text },
  placeAddr: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 2 },
  sheetSection: {
    ...fonts.semibold,
    fontSize: 18,
    color: palette.text,
    marginTop: 6,
    marginBottom: 12,
  },
  contactCard: { marginTop: 0, marginBottom: 20 },
  // Payment
  payCard: { backgroundColor: palette.surfaceDim, borderRadius: radii.lg, padding: 16 },
  payLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  payLabel: { ...fonts.medium, fontSize: 14, color: palette.textMuted },
  payValue: { ...fonts.semibold, fontSize: 14, color: palette.text },
  payDiscount: { color: palette.success },
  payDivider: { height: 1, backgroundColor: palette.line, marginVertical: 8 },
  payTotalLabel: { ...fonts.semibold, fontSize: 16, color: palette.text },
  payTotalValue: { ...fonts.bold, fontSize: 18, color: palette.text },
  payStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  policyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 4 },
  policyText: { ...fonts.medium, flex: 1, fontSize: 13, color: palette.textMuted, marginLeft: 8 },
  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
    gap: 10,
    // Keeps the footer above the scroll view it sits beside.
    zIndex: 10,
    elevation: 10,
  },
  footerLoader: {
    flex: 1,
    paddingVertical: 19,
  },
  footerMain: { flex: 1.4 },
  footerSide: { flex: 1 },
});
