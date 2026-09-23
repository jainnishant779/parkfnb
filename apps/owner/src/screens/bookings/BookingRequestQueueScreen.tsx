import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, radii, fonts } from '../../theme/kit';
import {
  PillButton,
  ScreenHeader,
  StatusTag,
  Avatar,
  EmptyState,
  IsoBlock,
} from '../../components/ui';
import type { RootStackScreenProps } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { bookingService } from '../../services/bookingService';
import { transformBooking, formatBookingDate, formatBookingTime } from '../../utils/bookingTransform';
import type { FullBooking } from '../../types/models';

type Props = RootStackScreenProps<'BookingRequestQueue'>;

export default function BookingRequestQueueScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { owner } = useAuth();

  const [requests, setRequests] = useState<FullBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async (isRefresh = false) => {
    if (!owner?.id) {
      setLoading(false);
      return;
    }
    if (!isRefresh) setLoading(true);
    try {
      const { bookings } = await bookingService.getOwnerBookings(owner.id, {
        status: 'pending',
        limit: 100,
      });
      setRequests(bookings.map(transformBooking));
    } catch (err) {
      console.error('Failed to load requests:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [owner?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [fetchRequests])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRequests(true);
  }, [fetchRequests]);

  // Acts directly rather than behind a confirmation: the alert component does
  // not present on this build, which left the button doing nothing at all.
  const handleApprove = useCallback(async (booking: FullBooking) => {
    setActionLoadingId(booking.id);
    try {
      await bookingService.approveBooking(booking.id);
      await fetchRequests(true);
    } catch (err: any) {
      const msg = err?.code === 'BIZ_CONFLICT'
        ? 'Cannot approve — another booking already occupies this time slot.'
        : err?.message || 'Approval failed. Please try again.';
      AppAlert.alert('Error', msg);
    } finally {
      setActionLoadingId(null);
    }
  }, [fetchRequests]);

  const handleReject = useCallback(async (booking: FullBooking) => {
    setActionLoadingId(booking.id);
    try {
      await bookingService.rejectBooking(booking.id);
      await fetchRequests(true);
    } catch (err: any) {
      AppAlert.alert('Error', err?.message || 'Rejection failed. Please try again.');
    } finally {
      setActionLoadingId(null);
    }
  }, [fetchRequests]);

  const renderItem = useCallback(({ item, index }: { item: FullBooking; index: number }) => {
    const isActing = actionLoadingId === item.id;
    const startDate = formatBookingDate(item.startAt);
    const startTime = formatBookingTime(item.startAt);
    const endTime   = formatBookingTime(item.endAt);
    const tone = index % 2 === 0 ? 'peach' : 'blue';

    return (
      // A plain View, not a Pressable: wrapping the card made every tap on
      // Approve or Reject bubble up and navigate away instead of running the
      // action. The header below opens the detail screen instead.
      <View style={styles.card}>
        <View style={styles.cardArt} pointerEvents="none">
          <IsoBlock size={120} tone={tone} />
        </View>

        {/* Renter info — tapping it opens the full booking */}
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.cardHeader}
          onPress={() => navigation.navigate('BookingDetails', { bookingId: item.id })}
        >
          <Avatar name={item.renterName} size={48} ring={false} />
          <View style={styles.cardHeaderText}>
            <Text style={styles.renterName} numberOfLines={1}>{item.renterName}</Text>
            <Text style={styles.listingName} numberOfLines={1}>{item.listingName}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.textSubtle} />
        </TouchableOpacity>

        <View style={styles.cardBody}>
          <StatusTag label="Request" tone="warning" />
          <Text style={styles.price}>₹{item.priceTotal.toFixed(2)}</Text>
          <Text style={styles.currency}>{item.currency}</Text>

          {/* Booking details */}
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={14} color={palette.textMuted} />
            <Text style={styles.detailText}>
              {startDate} · {startTime} – {endTime}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="car-outline" size={14} color={palette.textMuted} />
            <Text style={styles.detailText}>
              {item.vehicle.type} · {item.vehicle.plate}
            </Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.cardActions}>
          {isActing ? (
            <ActivityIndicator size="small" color={palette.ink} style={styles.actionLoader} />
          ) : (
            <>
              <PillButton
                variant="ink"
                size="md"
                icon="check"
                label="Approve"
                onPress={() => handleApprove(item)}
                style={styles.actionMain}
              />
              <PillButton
                variant="grey"
                size="md"
                icon="x"
                label="Reject"
                onPress={() => handleReject(item)}
                style={styles.actionSide}
              />
            </>
          )}
        </View>
      </View>
    );
  }, [navigation, actionLoadingId, handleApprove, handleReject]);

  const renderEmptyState = useCallback(() => (
    <View style={styles.emptyContainer}>
      <EmptyState
        tone="peach"
        title="No pending requests"
        subtitle="New booking requests from renters will appear here."
      />
    </View>
  ), []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />

      {/* Header */}
      <ScreenHeader
        title="Booking Requests"
        onBack={() => navigation.goBack()}
        right={
          requests.length > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{requests.length}</Text>
            </View>
          ) : null
        }
      />

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={palette.ink} />
        </View>
      ) : (
        <FlatList
          data={requests}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[palette.ink]}
              tintColor={palette.ink}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: palette.ink,
  },
  countBadgeText: {
    ...fonts.bold,
    color: palette.textInverse,
    fontSize: 12,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
    flexGrow: 1,
  },
  card: {
    borderRadius: radii.xl,
    backgroundColor: palette.surface,
    padding: 16,
    overflow: 'hidden',
  },
  cardArt: { position: 'absolute', right: -26, top: 92 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  cardHeaderText: {
    flex: 1,
  },
  renterName: {
    ...fonts.semibold,
    fontSize: 16,
    color: palette.text,
    marginBottom: 2,
  },
  listingName: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
  },
  cardBody: {
    width: '68%',
    paddingTop: 14,
  },
  price: {
    ...fonts.bold,
    fontSize: 26,
    letterSpacing: -0.6,
    color: palette.text,
    marginTop: 10,
  },
  currency: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  detailText: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.text,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 10,
  },
  actionLoader: {
    flex: 1,
    paddingVertical: 14,
  },
  actionMain: { flex: 1.3 },
  actionSide: { flex: 1 },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
