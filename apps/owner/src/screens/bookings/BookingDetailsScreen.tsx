import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import type { RootStackScreenProps } from '../../navigation/types';
import { bookingService } from '../../services/bookingService';
import { transformBooking, getRefundPolicy, getCheckInWindow, formatBookingDate, formatBookingTime } from '../../utils/bookingTransform';
import type { ApiBooking } from '../../types/api';
import type { FullBooking } from '../../types/models';

type Props = RootStackScreenProps<'BookingDetails'>;

// ─── Status helpers ───────────────────────────────────────────────────────────

function getStatusColor(status: FullBooking['status'], theme: ReturnType<typeof getTheme>) {
  switch (status) {
    case 'REQUESTED':  return { bg: theme.warningLight,  text: theme.warning };
    case 'UPCOMING':   return { bg: theme.primaryLight,  text: theme.primary };
    case 'ACTIVE':     return { bg: theme.successLight,  text: theme.success };
    case 'COMPLETED':  return { bg: theme.borderLight,   text: theme.textSecondary };
    case 'CANCELLED':  return { bg: theme.dangerLight,   text: theme.danger };
    case 'REJECTED':   return { bg: theme.dangerLight,   text: theme.danger };
    case 'NO_SHOW':    return { bg: theme.warningLight,  text: theme.warning };
    default:           return { bg: theme.borderLight,   text: theme.textSecondary };
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

function getPaymentLabel(paymentStatus: ApiBooking['paymentStatus']) {
  switch (paymentStatus) {
    case 'paid':               return { label: 'Paid', color: '#10B981', icon: 'checkmark-circle' };
    case 'pending':            return { label: 'Pending', color: '#F59E0B', icon: 'time-outline' };
    case 'failed':             return { label: 'Failed', color: '#EF4444', icon: 'close-circle' };
    case 'refunded':           return { label: 'Refunded', color: '#0D7377', icon: 'return-up-back-outline' };
    case 'partially_refunded': return { label: 'Partial Refund', color: '#0D7377', icon: 'return-up-back-outline' };
    default:                   return { label: paymentStatus, color: '#94A3B8', icon: 'help-circle-outline' };
  }
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children, theme }: { title: string; children: React.ReactNode; theme: ReturnType<typeof getTheme> }) {
  return (
    <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ icon, label, value, onPress, theme }: {
  icon: string;
  label?: string;
  value: string;
  onPress?: () => void;
  theme: ReturnType<typeof getTheme>;
}) {
  return (
    <Pressable style={styles.infoRow} onPress={onPress} disabled={!onPress}>
      <Ionicons name={icon} size={16} color={theme.textMuted} style={styles.infoIcon} />
      <View style={styles.infoText}>
        {label && <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{label}</Text>}
        <Text style={[styles.infoValue, { color: onPress ? theme.primary : theme.text }]}>{value}</Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />}
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BookingDetailsScreen({ route, navigation }: Props) {
  const { bookingId } = route.params;
  const theme = useMemo(() => getTheme(false), []);

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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.background} />
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Booking Details</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !booking || !rawBooking) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.background} />
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Booking Details</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={56} color={theme.danger} />
          <Text style={[styles.errorText, { color: theme.text }]}>{error || 'Something went wrong.'}</Text>
          <Pressable style={[styles.retryButton, { backgroundColor: theme.primary }]} onPress={fetchBooking}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Derived display values ──────────────────────────────────────────────

  const statusColors = getStatusColor(booking.status, theme);
  const paymentInfo  = getPaymentLabel(rawBooking.paymentStatus);
  const checkInWindow = booking.status === 'UPCOMING' ? getCheckInWindow(booking.startAt) : null;

  const startDate = formatBookingDate(booking.startAt);
  const startTime = formatBookingTime(booking.startAt);
  const endDate   = formatBookingDate(booking.endAt);
  const endTime   = formatBookingTime(booking.endAt);

  const durationLabel = rawBooking.durationHours === 1
    ? '1 hour'
    : `${rawBooking.durationHours % 1 === 0 ? rawBooking.durationHours : rawBooking.durationHours.toFixed(1)} hours`;

  const renterInitials = getInitials(booking.renterName);

  const refundPolicy = booking.status === 'UPCOMING' ? getRefundPolicy(booking.startAt) : null;

  // ─── Footer action buttons by status ────────────────────────────────────

  const renderFooterActions = () => {
    if (actionLoading) {
      return (
        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <ActivityIndicator size="small" color={theme.primary} style={styles.footerLoader} />
        </View>
      );
    }

    switch (booking.status) {
      case 'REQUESTED':
        return (
          <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <Pressable style={[styles.footerButton, styles.footerButtonOutline, { borderColor: theme.danger }]} onPress={handleReject}>
              <Text style={[styles.footerButtonText, { color: theme.danger }]}>Reject</Text>
            </Pressable>
            <Pressable style={[styles.footerButton, { backgroundColor: theme.success }]} onPress={handleApprove}>
              <Text style={[styles.footerButtonText, { color: '#FFFFFF' }]}>Approve</Text>
            </Pressable>
          </View>
        );
      case 'UPCOMING':
        return (
          <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <Pressable style={[styles.footerButton, styles.footerButtonOutline, { borderColor: theme.border }]} onPress={handleCancel}>
              <Text style={[styles.footerButtonText, { color: theme.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.footerButton, styles.footerButtonOutline, { borderColor: theme.primary }]} onPress={handleViewPass}>
              <Ionicons name="qr-code-outline" size={16} color={theme.primary} style={{ marginRight: 4 }} />
              <Text style={[styles.footerButtonText, { color: theme.primary }]}>Pass</Text>
            </Pressable>
            <Pressable style={[styles.footerButton, { backgroundColor: theme.primary }]} onPress={handleCheckIn}>
              <Text style={[styles.footerButtonText, { color: '#FFFFFF' }]}>Check In</Text>
            </Pressable>
          </View>
        );
      case 'ACTIVE':
        return (
          <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <Pressable style={[styles.footerButton, styles.footerButtonOutline, { borderColor: theme.warning }]} onPress={handleMarkNoShow}>
              <Text style={[styles.footerButtonText, { color: theme.warning }]}>No-Show</Text>
            </Pressable>
            <Pressable style={[styles.footerButton, { backgroundColor: theme.success }]} onPress={handleCheckOut}>
              <Text style={[styles.footerButtonText, { color: '#FFFFFF' }]}>Check Out</Text>
            </Pressable>
          </View>
        );
      default:
        return null;
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Booking Details</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
          <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>
            {getStatusLabel(booking.status)}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Booking Reference */}
        <Section title="BOOKING REFERENCE" theme={theme}>
          <Text style={[styles.bookingNumber, { color: theme.text }]}>
            #{rawBooking.bookingNumber}
          </Text>
          <Text style={[styles.bookingMeta, { color: theme.textSecondary }]}>
            Booked on {formatBookingDate(booking.createdAt)} at {formatBookingTime(booking.createdAt)}
          </Text>
          <View style={[styles.modeBadge, { backgroundColor: rawBooking.bookingMode === 'instant' ? theme.successLight : theme.primaryLight }]}>
            <Ionicons
              name={rawBooking.bookingMode === 'instant' ? 'flash-outline' : 'time-outline'}
              size={12}
              color={rawBooking.bookingMode === 'instant' ? theme.success : theme.primary}
            />
            <Text style={[styles.modeBadgeText, { color: rawBooking.bookingMode === 'instant' ? theme.success : theme.primary }]}>
              {rawBooking.bookingMode === 'instant' ? 'Instant Booking' : 'Request-based'}
            </Text>
          </View>
        </Section>

        {/* Parking Space */}
        <Section title="PARKING SPACE" theme={theme}>
          <InfoRow icon="business-outline" value={booking.listingName} theme={theme} />
          <InfoRow icon="location-outline" value={booking.addressLine} theme={theme} />
        </Section>

        {/* Timing */}
        <Section title="TIMING" theme={theme}>
          <InfoRow icon="calendar-outline" label="Start" value={`${startDate} · ${startTime}`} theme={theme} />
          <InfoRow icon="calendar-outline" label="End"   value={`${endDate} · ${endTime}`} theme={theme} />
          <InfoRow icon="timer-outline"    label="Duration" value={durationLabel} theme={theme} />

          {checkInWindow && (
            <View style={[styles.checkInWindowBanner, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
              <Ionicons name="information-circle-outline" size={14} color={theme.primary} />
              <Text style={[styles.checkInWindowText, { color: theme.primary }]}>
                Check-in window: {formatBookingTime(checkInWindow.opensAt)} – {formatBookingTime(checkInWindow.closesAt)}
              </Text>
            </View>
          )}

          {rawBooking.checkInTime && (
            <InfoRow icon="log-in-outline" label="Checked in" value={`${formatBookingDate(rawBooking.checkInTime)} at ${formatBookingTime(rawBooking.checkInTime)}`} theme={theme} />
          )}
          {rawBooking.checkOutTime && (
            <InfoRow icon="log-out-outline" label="Checked out" value={`${formatBookingDate(rawBooking.checkOutTime)} at ${formatBookingTime(rawBooking.checkOutTime)}`} theme={theme} />
          )}
          {booking.notes && (
            <InfoRow icon="close-circle-outline" label="Cancellation reason" value={booking.notes} theme={theme} />
          )}
        </Section>

        {/* Renter */}
        <Section title="RENTER" theme={theme}>
          <View style={styles.renterRow}>
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>{renterInitials}</Text>
            </View>
            <View style={styles.renterInfo}>
              <Text style={[styles.renterName, { color: theme.text }]}>{booking.renterName}</Text>
              {booking.renterPhone ? (
                <Pressable
                  style={styles.phoneRow}
                  onPress={() => handleCallRenter(booking.renterPhone!)}
                >
                  <Ionicons name="call-outline" size={14} color={theme.primary} />
                  <Text style={[styles.phoneText, { color: theme.primary }]}>{booking.renterPhone}</Text>
                </Pressable>
              ) : (
                <Text style={[styles.phoneText, { color: theme.textMuted }]}>No phone on file</Text>
              )}
            </View>
          </View>
          <View style={styles.vehicleRow}>
            <Ionicons name="car-outline" size={16} color={theme.textMuted} />
            <Text style={[styles.vehicleText, { color: theme.textSecondary }]}>
              {booking.vehicle.type} · {booking.vehicle.plate}
            </Text>
          </View>
        </Section>

        {/* Payment */}
        <Section title="PAYMENT" theme={theme}>
          <View style={styles.paymentRow}>
            <Text style={[styles.paymentLabel, { color: theme.textSecondary }]}>Base Price</Text>
            <Text style={[styles.paymentValue, { color: theme.text }]}>
              ₹{rawBooking.basePrice.toFixed(2)}
            </Text>
          </View>
          {rawBooking.discountAmount > 0 && (
            <View style={styles.paymentRow}>
              <Text style={[styles.paymentLabel, { color: theme.textSecondary }]}>Discount</Text>
              <Text style={[styles.paymentValue, { color: theme.success }]}>
                -₹{rawBooking.discountAmount.toFixed(2)}
              </Text>
            </View>
          )}
          <View style={[styles.paymentDivider, { backgroundColor: theme.border }]} />
          <View style={styles.paymentRow}>
            <Text style={[styles.paymentTotalLabel, { color: theme.text }]}>Total</Text>
            <Text style={[styles.paymentTotalValue, { color: theme.text }]}>
              ₹{rawBooking.totalAmount.toFixed(2)}
            </Text>
          </View>
          <View style={styles.paymentStatusRow}>
            <Text style={[styles.paymentLabel, { color: theme.textSecondary }]}>Payment</Text>
            <View style={styles.paymentStatusBadge}>
              <Ionicons name={paymentInfo.icon} size={14} color={paymentInfo.color} />
              <Text style={[styles.paymentStatusText, { color: paymentInfo.color }]}>
                {paymentInfo.label}
              </Text>
            </View>
          </View>
        </Section>

        {/* Cancellation Policy (UPCOMING only) */}
        {refundPolicy && (
          <View style={[styles.refundBanner, { backgroundColor: theme.warningLight, borderColor: theme.warning }]}>
            <Ionicons name="information-circle-outline" size={16} color={theme.warning} />
            <Text style={[styles.refundBannerText, { color: theme.warning }]}>
              {refundPolicy.label}
            </Text>
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Footer Actions */}
      {renderFooterActions()}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing[1],
    marginRight: spacing[2],
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
  },
  headerRight: {
    width: 32,
  },
  statusBadge: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  statusBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    gap: spacing[3],
  },
  errorText: {
    fontSize: fontSize.base,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  bottomPad: {
    height: spacing[6],
  },
  // Section
  section: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
    letterSpacing: 0.8,
    marginBottom: spacing[3],
  },
  // Booking reference
  bookingNumber: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
    marginBottom: spacing[1],
    fontVariant: ['tabular-nums'],
  },
  bookingMeta: {
    fontSize: fontSize.sm,
    marginBottom: spacing[3],
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  modeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  // Info row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
  },
  infoIcon: {
    marginTop: 2,
    marginRight: spacing[3],
    width: 16,
  },
  infoText: {
    flex: 1,
  },
  infoLabel: {
    fontSize: fontSize.xs,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  // Check-in window
  checkInWindowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing[3],
  },
  checkInWindowText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  // Renter
  renterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold as any,
  },
  renterInfo: {
    flex: 1,
  },
  renterName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[1],
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  phoneText: {
    fontSize: fontSize.sm,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  vehicleText: {
    fontSize: fontSize.sm,
  },
  // Payment
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  paymentLabel: {
    fontSize: fontSize.sm,
  },
  paymentValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    fontVariant: ['tabular-nums'],
  },
  paymentDivider: {
    height: 1,
    marginVertical: spacing[2],
  },
  paymentTotalLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
  paymentTotalValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as any,
    fontVariant: ['tabular-nums'],
  },
  paymentStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing[2],
  },
  paymentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  paymentStatusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  // Refund banner
  refundBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginBottom: spacing[3],
  },
  refundBannerText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  // Footer
  footer: {
    flexDirection: 'row',
    padding: spacing[4],
    borderTopWidth: 1,
    gap: spacing[3],
    // Keeps the footer above the scroll view it sits beside.
    zIndex: 10,
    elevation: 10,
    ...Platform.select({
      ios: {
        paddingBottom: spacing[6],
      },
    }),
  },
  footerLoader: {
    flex: 1,
    paddingVertical: spacing[2],
  },
  footerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
  },
  footerButtonOutline: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  footerButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
});
