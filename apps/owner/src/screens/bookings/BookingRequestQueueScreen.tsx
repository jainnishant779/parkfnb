import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import type { RootStackScreenProps } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { bookingService } from '../../services/bookingService';
import { transformBooking, formatBookingDate, formatBookingTime } from '../../utils/bookingTransform';
import type { FullBooking } from '../../types/models';

type Props = RootStackScreenProps<'BookingRequestQueue'>;

export default function BookingRequestQueueScreen({ navigation }: Props) {
  const theme = useMemo(() => getTheme(false), []);
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

  const renderItem = useCallback(({ item }: { item: FullBooking }) => {
    const isActing = actionLoadingId === item.id;
    const startDate = formatBookingDate(item.startAt);
    const startTime = formatBookingTime(item.startAt);
    const endTime   = formatBookingTime(item.endAt);

    return (
      // A plain View, not a Pressable: wrapping the card made every tap on
      // Approve or Reject bubble up and navigate away instead of running the
      // action. The header below opens the detail screen instead.
      <View
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        {/* Renter info — tapping it opens the full booking */}
        <Pressable
          style={styles.cardHeader}
          onPress={() => navigation.navigate('BookingDetails', { bookingId: item.id })}
        >
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <Text style={styles.avatarText}>
              {item.renterName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </Text>
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={[styles.renterName, { color: theme.text }]}>{item.renterName}</Text>
            <Text style={[styles.listingName, { color: theme.textSecondary }]}>{item.listingName}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>

        {/* Booking details */}
        <View style={[styles.cardDetails, { borderTopColor: theme.borderLight }]}>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={14} color={theme.textMuted} />
            <Text style={[styles.detailText, { color: theme.textSecondary }]}>
              {startDate} · {startTime} – {endTime}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="car-outline" size={14} color={theme.textMuted} />
            <Text style={[styles.detailText, { color: theme.textSecondary }]}>
              {item.vehicle.type} · {item.vehicle.plate}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="cash-outline" size={14} color={theme.textMuted} />
            <Text style={[styles.detailText, { color: theme.textSecondary }]}>
              ₹{item.priceTotal.toFixed(2)} · {item.currency}
            </Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.cardActions}>
          {isActing ? (
            <ActivityIndicator size="small" color={theme.primary} style={styles.actionLoader} />
          ) : (
            <>
              <Pressable
                style={[styles.actionButton, styles.rejectButton, { borderColor: theme.danger }]}
                onPress={() => handleReject(item)}
              >
                <Text style={[styles.actionButtonText, { color: theme.danger }]}>Reject</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, { backgroundColor: theme.success }]}
                onPress={() => handleApprove(item)}
              >
                <Text style={[styles.actionButtonText, { color: '#FFFFFF' }]}>Approve</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }, [theme, navigation, actionLoadingId, handleApprove, handleReject]);

  const renderEmptyState = useCallback(() => (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrap, { backgroundColor: theme.borderLight }]}>
        <Ionicons name="calendar-check-outline" size={48} color={theme.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>No pending requests</Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        New booking requests from renters will appear here.
      </Text>
    </View>
  ), [theme]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Booking Requests</Text>
        {requests.length > 0 && (
          <View style={[styles.countBadge, { backgroundColor: theme.primary }]}>
            <Text style={styles.countBadgeText}>{requests.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={requests}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
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
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold as any,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: spacing[4],
    gap: spacing[3],
    flexGrow: 1,
  },
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    gap: spacing[3],
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold as any,
  },
  cardHeaderText: {
    flex: 1,
  },
  renterName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    marginBottom: 2,
  },
  listingName: {
    fontSize: fontSize.sm,
  },
  cardDetails: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderTopWidth: 1,
    paddingTop: spacing[3],
    gap: spacing[2],
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  detailText: {
    fontSize: fontSize.sm,
  },
  cardActions: {
    flexDirection: 'row',
    padding: spacing[3],
    gap: spacing[3],
  },
  actionLoader: {
    flex: 1,
    paddingVertical: spacing[2],
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  actionButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[12],
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
