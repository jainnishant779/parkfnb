import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
  Share,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import type { RootStackScreenProps } from '../../navigation/types';
import { bookingService } from '../../services/bookingService';
import { transformBooking, formatBookingDate, formatBookingTime } from '../../utils/bookingTransform';
import type { ApiBooking } from '../../types/api';
import type { FullBooking } from '../../types/models';

type Props = RootStackScreenProps<'AccessPass'>;

export default function AccessPassQrScreen({ route, navigation }: Props) {
  const { bookingId } = route.params;
  const theme = useMemo(() => getTheme(false), []);

  const [rawBooking, setRawBooking] = useState<ApiBooking | null>(null);
  const [booking, setBooking] = useState<FullBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBooking = useCallback(async () => {
    try {
      setError(null);
      const { booking: raw } = await bookingService.getBookingById(bookingId);
      setRawBooking(raw);
      setBooking(transformBooking(raw));
    } catch (err: any) {
      setError(err?.message || 'Failed to load booking.');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useFocusEffect(
    useCallback(() => {
      fetchBooking();
    }, [fetchBooking])
  );

  const handleShare = useCallback(async () => {
    if (!rawBooking || !booking) return;
    try {
      await Share.share({
        message: [
          `Access Pass — ${booking.listingName}`,
          `Booking Ref: #${rawBooking.bookingNumber}`,
          `Renter: ${booking.renterName}`,
          `Vehicle: ${booking.vehicle.plate}`,
          `Date: ${formatBookingDate(booking.startAt)}`,
          `Time: ${formatBookingTime(booking.startAt)} – ${formatBookingTime(booking.endAt)}`,
        ].join('\n'),
        title: `Access Pass #${rawBooking.bookingNumber}`,
      });
    } catch (err) {
      // Share cancelled — no action needed
    }
  }, [rawBooking, booking]);

  // ─── Loading / Error ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.background} />
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Access Pass</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !rawBooking || !booking) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.background} />
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Access Pass</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.danger} />
          <Text style={[styles.errorText, { color: theme.text }]}>{error || 'Something went wrong.'}</Text>
          <Pressable style={[styles.retryButton, { backgroundColor: theme.primary }]} onPress={fetchBooking}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Access Pass</Text>
        <Pressable onPress={handleShare} style={styles.shareButton} hitSlop={8}>
          <Ionicons name="share-outline" size={22} color={theme.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Pass card */}
        <View style={[styles.passCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {/* Property + space header */}
          <View style={[styles.passHeader, { backgroundColor: theme.primary }]}>
            <Text style={styles.passPropertyName} numberOfLines={1}>{booking.listingName}</Text>
            <Text style={styles.passAddress} numberOfLines={1}>{booking.addressLine}</Text>
          </View>

          {/* Large booking ref */}
          <View style={styles.refContainer}>
            <View style={[styles.refBox, { borderColor: theme.border }]}>
              <Ionicons name="qr-code-outline" size={48} color={theme.textMuted} style={styles.qrIcon} />
              <Text style={[styles.bookingRef, { color: theme.text }]}>
                #{rawBooking.bookingNumber}
              </Text>
              <Text style={[styles.showToHost, { color: theme.textSecondary }]}>
                Show this reference to your host
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />

          {/* Booking details */}
          <View style={styles.passDetails}>
            <PassRow label="Renter" value={booking.renterName} icon="person-outline" theme={theme} />
            <PassRow
              label="Vehicle"
              value={`${booking.vehicle.plate}`}
              icon="car-outline"
              theme={theme}
            />
            <PassRow
              label="Date"
              value={formatBookingDate(booking.startAt)}
              icon="calendar-outline"
              theme={theme}
            />
            <PassRow
              label="Time"
              value={`${formatBookingTime(booking.startAt)} – ${formatBookingTime(booking.endAt)}`}
              icon="time-outline"
              theme={theme}
            />
          </View>
        </View>

        {/* Info note */}
        <View style={[styles.infoNote, { backgroundColor: theme.primaryLight }]}>
          <Ionicons name="information-circle-outline" size={16} color={theme.primary} />
          <Text style={[styles.infoNoteText, { color: theme.primary }]}>
            Verify this booking reference with the renter on arrival. QR scanning coming soon.
          </Text>
        </View>

        {/* Share button */}
        <Pressable
          style={[styles.shareFullButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={handleShare}
        >
          <Ionicons name="share-social-outline" size={18} color={theme.text} />
          <Text style={[styles.shareFullButtonText, { color: theme.text }]}>Share Access Pass</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function PassRow({ label, value, icon, theme }: {
  label: string;
  value: string;
  icon: string;
  theme: ReturnType<typeof getTheme>;
}) {
  return (
    <View style={styles.passRow}>
      <Ionicons name={icon} size={15} color={theme.textMuted} style={styles.passRowIcon} />
      <Text style={[styles.passRowLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.passRowValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  headerRight: { width: 32 },
  shareButton: {
    padding: spacing[1],
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[6],
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
  scrollContent: {
    padding: spacing[4],
    gap: spacing[4],
  },
  passCard: {
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  passHeader: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  passPropertyName: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold as any,
    marginBottom: 2,
  },
  passAddress: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.sm,
  },
  refContainer: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[6],
    alignItems: 'center',
  },
  refBox: {
    width: '100%',
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: borderRadius.xl,
    paddingVertical: spacing[6],
    paddingHorizontal: spacing[4],
  },
  qrIcon: {
    marginBottom: spacing[3],
    opacity: 0.4,
  },
  bookingRef: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold as any,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  showToHost: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    marginHorizontal: spacing[4],
  },
  passDetails: {
    padding: spacing[4],
    gap: spacing[3],
  },
  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  passRowIcon: {
    width: 15,
  },
  passRowLabel: {
    fontSize: fontSize.sm,
    width: 56,
  },
  passRowValue: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: borderRadius.lg,
  },
  infoNoteText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  shareFullButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[4],
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  shareFullButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
});
