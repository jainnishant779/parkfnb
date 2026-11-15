import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, radii, fonts } from '../../theme/kit';
import {
  PillButton,
  IconCircle,
  ScreenHeader,
  InfoGrid,
  EmptyState,
} from '../../components/ui';
import type { RootStackScreenProps } from '../../navigation/types';
import { bookingService } from '../../services/bookingService';
import { transformBooking, formatBookingDate, formatBookingTime } from '../../utils/bookingTransform';
import type { ApiBooking } from '../../types/api';
import type { FullBooking } from '../../types/models';

type Props = RootStackScreenProps<'AccessPass'>;

export default function AccessPassQrScreen({ route, navigation }: Props) {
  const { bookingId } = route.params;
  const insets = useSafeAreaInsets();

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
    } catch {
      // Share cancelled — no action needed
    }
  }, [rawBooking, booking]);

  // ─── Loading / Error ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />
        <ScreenHeader title="Access Pass" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.ink} />
        </View>
      </View>
    );
  }

  if (error || !rawBooking || !booking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />
        <ScreenHeader title="Access Pass" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
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

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />

      {/* Header */}
      <ScreenHeader
        title="Access Pass"
        onBack={() => navigation.goBack()}
        right={<IconCircle icon="share" size={42} onPress={handleShare} />}
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Pass card */}
        <View style={styles.passCard}>
          {/* Property + space header */}
          <Text style={styles.passPropertyName} numberOfLines={1}>{booking.listingName}</Text>
          <Text style={styles.passAddress} numberOfLines={1}>{booking.addressLine}</Text>

          {/* Centred code block with the large booking ref */}
          <View style={styles.qrBox}>
            <Ionicons name="qr-code-outline" size={132} color={palette.text} />
          </View>
          <Text style={styles.bookingRef}>#{rawBooking.bookingNumber}</Text>
          <Text style={styles.showToHost}>Show this reference to your host</Text>

          {/* Divider with ticket notches */}
          <View style={styles.dividerRow}>
            <View style={[styles.notch, styles.notchLeft]} />
            <View style={styles.dashed} />
            <View style={[styles.notch, styles.notchRight]} />
          </View>

          {/* Booking details */}
          <InfoGrid
            items={[
              { label: 'Renter', value: booking.renterName },
              { label: 'Vehicle', value: `${booking.vehicle.plate}` },
              { label: 'Date', value: formatBookingDate(booking.startAt) },
              {
                label: 'Time',
                value: `${formatBookingTime(booking.startAt)} – ${formatBookingTime(booking.endAt)}`,
              },
            ]}
          />
        </View>

        {/* Info note */}
        <View style={styles.infoNote}>
          <Ionicons name="information-circle-outline" size={18} color={palette.text} />
          <Text style={styles.infoNoteText}>
            Verify this booking reference with the renter on arrival. QR scanning coming soon.
          </Text>
        </View>

        {/* Share button */}
        <PillButton variant="ink" icon="share-2" label="Share Access Pass" onPress={handleShare} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 14,
  },
  passCard: {
    borderRadius: radii.xl,
    backgroundColor: palette.surface,
    padding: 22,
    overflow: 'hidden',
  },
  passPropertyName: {
    ...fonts.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    color: palette.text,
    textAlign: 'center',
  },
  passAddress: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: 3,
  },
  qrBox: {
    alignSelf: 'center',
    width: 200,
    height: 200,
    borderRadius: radii.lg,
    backgroundColor: palette.surfaceDim,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  bookingRef: {
    ...fonts.bold,
    fontSize: 30,
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    color: palette.text,
    marginTop: 18,
  },
  showToHost: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 22,
    marginHorizontal: -22,
  },
  notch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.bg,
  },
  notchLeft: { marginLeft: -11 },
  notchRight: { marginRight: -11 },
  dashed: {
    flex: 1,
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: palette.line,
    marginHorizontal: 8,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: palette.peachSoft,
  },
  infoNoteText: {
    ...fonts.medium,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: palette.text,
  },
});
