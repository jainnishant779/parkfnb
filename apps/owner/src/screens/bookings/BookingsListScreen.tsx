import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import Animated, { FadeIn } from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { palette, radii, shadow, fonts } from '../../theme/kit';
import { PillButton, IconCircle, SearchPill, EmptyState } from '../../components/ui';
import type {
  FullBooking,
  BookingTabType,
  BookingStatus,
  BookingSortOption,
  VehicleType,
  DateRangeOption,
  BookingsTabCounts,
} from '../../types/models';
import {
  saveBookingsUIState,
  filterAndSortBookings,
  getBookingsTabCounts,
} from '../../utils/storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { bookingService } from '../../services/bookingService';
import { transformBooking, getRefundPolicy } from '../../utils/bookingTransform';
import { BookingCard, BookingsSkeleton } from './components';

// Tab configuration
const TABS: { key: BookingTabType; label: string }[] = [
  { key: 'requests', label: 'Requests' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'active', label: 'Active' },
  { key: 'past', label: 'Past' },
];

// Sort options
const SORT_OPTIONS: { key: BookingSortOption; label: string }[] = [
  { key: 'newest', label: 'Newest First' },
  { key: 'start_soonest', label: 'Start Time (Soonest)' },
  { key: 'price_high', label: 'Highest Price' },
];

// Date range options
const DATE_RANGE_OPTIONS: { key: DateRangeOption; label: string }[] = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
];

// Vehicle filter options
const VEHICLE_OPTIONS: { key: VehicleType | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'grid-outline' },
  { key: 'CAR', label: 'Car', icon: 'car-outline' },
  { key: 'BIKE', label: 'Bike', icon: 'bicycle-outline' },
  { key: 'TRUCK', label: 'Truck', icon: 'bus-outline' },
  { key: 'VAN', label: 'Van', icon: 'car-sport-outline' },
];

// Past tab status filters
const PAST_STATUS_OPTIONS: { key: BookingStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'NO_SHOW', label: 'No Show' },
];

// Empty state config per tab
const EMPTY_STATE_CONFIG: Record<BookingTabType, { icon: string; title: string; subtitle: string; tone: 'peach' | 'blue' | 'grey' }> = {
  requests: {
    tone: 'peach',
    icon: 'time-outline',
    title: 'No booking requests',
    subtitle: 'New booking requests will appear here for your approval',
  },
  upcoming: {
    tone: 'blue',
    icon: 'calendar-outline',
    title: 'No upcoming bookings',
    subtitle: 'Approved bookings scheduled for the future will show here',
  },
  active: {
    tone: 'peach',
    icon: 'car-outline',
    title: 'No active bookings',
    subtitle: 'Bookings currently in progress will appear here',
  },
  past: {
    tone: 'grey',
    icon: 'archive-outline',
    title: 'No past bookings',
    subtitle: 'Completed, cancelled, or no-show bookings will be listed here',
  },
};

// Action confirmation config
interface ActionConfig {
  title: string;
  message: string;
  confirmText: string;
  confirmVariant: 'ink' | 'danger';
  icon: string;
}

type ActionType = 'approve' | 'reject' | 'cancel' | 'complete' | 'noshow';

const ACTION_CONFIG: Record<ActionType, ActionConfig> = {
  approve: {
    title: 'Approve Booking',
    message: 'Are you sure you want to approve this booking request?',
    confirmText: 'Approve',
    confirmVariant: 'ink',
    icon: 'checkmark-circle-outline',
  },
  reject: {
    title: 'Reject Booking',
    message: 'Are you sure you want to reject this booking request? The renter will be notified.',
    confirmText: 'Reject',
    confirmVariant: 'danger',
    icon: 'close-circle-outline',
  },
  cancel: {
    title: 'Cancel Booking',
    message: 'Are you sure you want to cancel this booking?',
    confirmText: 'Cancel Booking',
    confirmVariant: 'danger',
    icon: 'close-circle-outline',
  },
  complete: {
    title: 'Check Out Renter',
    message: 'Check out the renter? Overtime charges (1.5×) apply if past the end time.',
    confirmText: 'Check Out',
    confirmVariant: 'ink',
    icon: 'checkmark-done-outline',
  },
  noshow: {
    title: 'Mark No-Show',
    message: 'Mark the renter as a no-show? This will be recorded on the booking.',
    confirmText: 'Mark No-Show',
    confirmVariant: 'ink',
    icon: 'alert-circle-outline',
  },
};

export default function BookingsListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { owner } = useAuth();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allBookings, setAllBookings] = useState<FullBooking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<FullBooking[]>([]);
  const [tabCounts, setTabCounts] = useState<BookingsTabCounts>({ requests: 0, upcoming: 0, active: 0, past: 0 });

  // UI State
  const [selectedTab, setSelectedTab] = useState<BookingTabType>('requests');
  const [searchText, setSearchText] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState<VehicleType | 'all'>('all');
  const [pastStatusFilter, setPastStatusFilter] = useState<BookingStatus | 'all'>('all');
  const [dateRange, setDateRange] = useState<DateRangeOption>('all');
  const [sortOption, setSortOption] = useState<BookingSortOption>('newest');

  // Modals
  const [showSortModal, setShowSortModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    booking: FullBooking | null;
    actionType: ActionType | null;
    cancelRefundLabel?: string;
  }>({ visible: false, booking: null, actionType: null });

  // Search debounce
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Load bookings from API
  const loadBookings = useCallback(async (isRefresh = false) => {
    if (!owner?.id) {
      setIsLoading(false);
      return;
    }
    if (!isRefresh) setIsLoading(true);
    try {
      setError(null);
      const { bookings } = await bookingService.getOwnerBookings(owner.id, { limit: 200 });
      const transformed = bookings.map(transformBooking);
      setAllBookings(transformed);
      setTabCounts(getBookingsTabCounts(transformed));
    } catch (err) {
      setError('Failed to load bookings. Pull down to refresh.');
      console.error('Failed to load bookings:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [owner?.id]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  // Poll every 30s for new requests
  useEffect(() => {
    if (!owner?.id) return;
    const interval = setInterval(() => loadBookings(true), 30_000);
    return () => clearInterval(interval);
  }, [loadBookings, owner?.id]);

  // Filter bookings when filters change
  useEffect(() => {
    const filtered = filterAndSortBookings(allBookings, {
      searchText: debouncedSearch,
      tab: selectedTab,
      vehicleFilter,
      statusFilter: selectedTab === 'past' ? pastStatusFilter : 'all',
      dateRange,
      sortOption,
    });
    setFilteredBookings(filtered);
  }, [
    allBookings,
    debouncedSearch,
    selectedTab,
    vehicleFilter,
    pastStatusFilter,
    dateRange,
    sortOption,
  ]);

  // Debounce search input
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 300);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchText]);

  // Save UI state when it changes
  useEffect(() => {
    if (!isLoading) {
      saveBookingsUIState({
        selectedTab,
        searchText: debouncedSearch,
        vehicleFilter,
        statusFilter: pastStatusFilter,
        dateRange,
        sortOption,
      });
    }
  }, [selectedTab, debouncedSearch, vehicleFilter, pastStatusFilter, dateRange, sortOption, isLoading]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadBookings(true);
  }, [loadBookings]);

  // Handle tab change
  const handleTabChange = useCallback((tab: BookingTabType) => {
    setSelectedTab(tab);
    // Reset past status filter when leaving past tab
    if (tab !== 'past') {
      setPastStatusFilter('all');
    }
  }, []);

  // Handle booking press (navigate to details)
  const handleBookingPress = useCallback((booking: FullBooking) => {
    navigation.navigate('BookingDetails', { bookingId: booking.id });
  }, [navigation]);

  // Handle action confirmation
  const showConfirmation = useCallback((booking: FullBooking, actionType: ActionType) => {
    if (actionType === 'cancel') {
      const { label } = getRefundPolicy(booking.startAt);
      setConfirmModal({ visible: true, booking, actionType, cancelRefundLabel: label });
    } else {
      setConfirmModal({ visible: true, booking, actionType });
    }
  }, []);

  const handleConfirmAction = useCallback(async () => {
    if (!confirmModal.booking || !confirmModal.actionType) return;
    const bookingId = confirmModal.booking.id;
    setActionLoading(true);
    try {
      switch (confirmModal.actionType) {
        case 'approve':
          await bookingService.approveBooking(bookingId);
          break;
        case 'reject':
          await bookingService.rejectBooking(bookingId);
          break;
        case 'cancel': {
          const cancelResult = await bookingService.cancelBooking(bookingId);
          if (cancelResult.refund && cancelResult.refund.amount > 0) {
            AppAlert.alert(
              'Booking Cancelled',
              `A refund of ₹${cancelResult.refund.amount.toFixed(2)} (${cancelResult.refund.percentage}%) will be processed.`,
            );
          }
          break;
        }
        case 'complete': {
          const result = await bookingService.checkOutBooking(bookingId);
          if (result.overtime) {
            AppAlert.alert(
              'Overtime Charge Applied',
              `₹${result.overtime.charge.toFixed(2)} overtime charge added at 1.5× hourly rate.`,
            );
          }
          break;
        }
        case 'noshow':
          await bookingService.markNoShow(bookingId);
          break;
      }
      setConfirmModal({ visible: false, booking: null, actionType: null });
      await loadBookings(true);
    } catch (err: any) {
      setConfirmModal({ visible: false, booking: null, actionType: null });
      const msg = err?.code === 'BIZ_CONFLICT'
        ? 'Cannot approve — another booking already occupies this time slot.'
        : err?.message || 'Action failed. Please try again.';
      AppAlert.alert('Error', msg);
    } finally {
      setActionLoading(false);
    }
  }, [confirmModal, loadBookings]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmModal({ visible: false, booking: null, actionType: null });
  }, []);

  // Handle check-in directly (no confirm modal — time-sensitive action)
  const handleCheckIn = useCallback(async (booking: FullBooking) => {
    setActionLoading(true);
    try {
      await bookingService.checkInBooking(booking.id);
      await loadBookings(true);
    } catch (err: any) {
      const code: string = err?.code || '';
      if (code === 'BIZ_CHECKIN_TOO_EARLY') {
        AppAlert.alert(
          'Too Early',
          'The check-in window hasn\'t opened yet. Check in within 1 hour of the booking start time.',
        );
      } else if (code === 'BIZ_CHECKIN_WINDOW_PASSED') {
        // Backend auto-marked as no-show — refresh to reflect new status in list
        AppAlert.alert(
          'Check-In Window Passed',
          'The check-in window has passed. This booking has been marked as no-show.',
        );
        await loadBookings(true);
      } else {
        AppAlert.alert('Error', err?.message || 'Check-in failed. Please try again.');
      }
    } finally {
      setActionLoading(false);
    }
  }, [loadBookings]);

  // Handle retry after error
  const handleRetry = useCallback(() => {
    setError(null);
    loadBookings();
  }, [loadBookings]);

  // Render booking card
  const renderBookingCard = useCallback(
    ({ item }: { item: FullBooking }) => (
      <BookingCard
        booking={item}
        onPress={handleBookingPress}
        onApprove={(b) => showConfirmation(b, 'approve')}
        onReject={(b) => showConfirmation(b, 'reject')}
        onCancel={(b) => showConfirmation(b, 'cancel')}
        onCheckIn={handleCheckIn}
        onComplete={(b) => showConfirmation(b, 'complete')}
        onNoShow={(b) => showConfirmation(b, 'noshow')}
        testID={`booking-card-${item.id}`}
      />
    ),
    [handleBookingPress, showConfirmation, handleCheckIn]
  );

  // Render empty state
  const renderEmptyState = useCallback(() => {
    const config = EMPTY_STATE_CONFIG[selectedTab];

    // Check if empty due to filters
    const hasFilters = debouncedSearch || vehicleFilter !== 'all' || dateRange !== 'all' ||
      (selectedTab === 'past' && pastStatusFilter !== 'all');

    if (hasFilters) {
      return (
        <Animated.View entering={FadeIn} style={styles.emptyContainer}>
          <EmptyState
            tone="grey"
            title="No results found"
            subtitle="Try adjusting your filters or search term"
            action="Clear Filters"
            onAction={() => {
              setSearchText('');
              setDebouncedSearch('');
              setVehicleFilter('all');
              setDateRange('all');
              setPastStatusFilter('all');
            }}
          />
        </Animated.View>
      );
    }

    return (
      <Animated.View entering={FadeIn} style={styles.emptyContainer}>
        <EmptyState tone={config.tone} title={config.title} subtitle={config.subtitle} />
      </Animated.View>
    );
  }, [selectedTab, debouncedSearch, vehicleFilter, dateRange, pastStatusFilter]);

  // Render list header (filters)
  const renderListHeader = useCallback(() => (
    <View style={styles.filtersContainer}>
      {/* Vehicle Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScrollContent}
      >
        {VEHICLE_OPTIONS.map((option) => {
          const isActive = vehicleFilter === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              activeOpacity={0.75}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setVehicleFilter(option.key)}
            >
              <Ionicons
                name={option.icon}
                size={15}
                color={isActive ? palette.textInverse : palette.text}
              />
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Active date range / sort summary */}
      {(dateRange !== 'all' || sortOption !== 'newest') && (
        <View style={styles.summaryRow}>
          {dateRange !== 'all' && (
            <TouchableOpacity style={styles.summaryPill} onPress={() => setShowDateModal(true)} activeOpacity={0.75}>
              <Ionicons name="calendar-outline" size={13} color={palette.text} />
              <Text style={styles.summaryPillText}>
                {DATE_RANGE_OPTIONS.find((o) => o.key === dateRange)?.label || 'Date'}
              </Text>
            </TouchableOpacity>
          )}
          {sortOption !== 'newest' && (
            <TouchableOpacity style={styles.summaryPill} onPress={() => setShowSortModal(true)} activeOpacity={0.75}>
              <Ionicons name="swap-vertical-outline" size={13} color={palette.text} />
              <Text style={styles.summaryPillText}>
                {SORT_OPTIONS.find((o) => o.key === sortOption)?.label}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Past Status Filter (only for past tab) */}
      {selectedTab === 'past' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScrollContent}
          style={styles.pastStatusScroll}
        >
          {PAST_STATUS_OPTIONS.map((option) => {
            const isActive = pastStatusFilter === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                activeOpacity={0.75}
                style={[styles.statusChip, isActive && styles.statusChipActive]}
                onPress={() => setPastStatusFilter(option.key)}
              >
                <Text style={[styles.statusChipText, isActive && styles.filterChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  ), [vehicleFilter, dateRange, sortOption, selectedTab, pastStatusFilter]);

  // Header: title + icon circles (date range, sort)
  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Bookings</Text>
      <IconCircle
        icon="calendar"
        size={46}
        badge={dateRange !== 'all'}
        onPress={() => setShowDateModal(true)}
      />
      <IconCircle
        icon="sliders"
        size={46}
        badge={sortOption !== 'newest'}
        onPress={() => setShowSortModal(true)}
        style={styles.headerGap}
      />
    </View>
  );

  // Render owner not set up state
  if (!owner?.id && !isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.errorContainer}>
          <EmptyState
            tone="peach"
            title="Complete onboarding first"
            subtitle="Set up your owner profile to start managing bookings."
          />
        </View>
      </View>
    );
  }

  // Render error state
  if (error && !isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.errorContainer}>
          <EmptyState
            tone="grey"
            title="Something went wrong"
            subtitle={error}
            action="Try Again"
            onAction={handleRetry}
          />
        </View>
      </View>
    );
  }

  // Render loading state
  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />
        {renderHeader()}
        <BookingsSkeleton count={4} showTabs showSearch showFilters />
      </View>
    );
  }

  const sheetOptions = (
    title: string,
    options: { key: string; label: string }[],
    value: string,
    onSelect: (key: any) => void,
    onClose: () => void,
  ) => (
    <View style={[styles.modalOverlay, styles.overlayFill]}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.grabber} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <IconCircle icon="x" size={40} variant="grey" onPress={onClose} />
        </View>
        {options.map((option, i) => {
          const isActive = value === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              activeOpacity={0.6}
              style={[styles.sheetOption, i < options.length - 1 && styles.sheetOptionDivider]}
              onPress={() => onSelect(option.key)}
            >
              <Text style={[styles.sheetOptionText, isActive && styles.sheetOptionTextActive]}>
                {option.label}
              </Text>
              {isActive ? (
                <View style={styles.checkDot}>
                  <Ionicons name="checkmark" size={16} color={palette.textInverse} />
                </View>
              ) : (
                <View style={styles.uncheckDot} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />

      {/* Header */}
      {renderHeader()}

      {/* Search Bar */}
      <SearchPill
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Search bookings"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.search}
        right={
          searchText.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchText('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={palette.textMuted} />
            </TouchableOpacity>
          ) : null
        }
      />

      {/* Tab Bar — segmented pill with counts */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = selectedTab === tab.key;
          const count = tabCounts[tab.key];
          return (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.8}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => handleTabChange(tab.key)}
            >
              <Text
                style={[styles.tabText, isActive && styles.tabTextActive]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              {count > 0 && (
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                    {count > 99 ? '99+' : count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bookings List */}
      <FlatList
        data={filteredBookings}
        renderItem={renderBookingCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 120 }]}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[palette.ink]}
            tintColor={palette.ink}
          />
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
      />

      {/* Sort sheet */}
      {showSortModal
        ? sheetOptions(
            'Sort by',
            SORT_OPTIONS,
            sortOption,
            (key: BookingSortOption) => {
              setSortOption(key);
              setShowSortModal(false);
            },
            () => setShowSortModal(false),
          )
        : null}

      {/* Date range sheet */}
      {showDateModal
        ? sheetOptions(
            'Date range',
            DATE_RANGE_OPTIONS,
            dateRange,
            (key: DateRangeOption) => {
              setDateRange(key);
              setShowDateModal(false);
            },
            () => setShowDateModal(false),
          )
        : null}

      {/* Confirm Action — an overlay, not a <Modal>: modals do not present on
          this build, so the confirmation was invisible and Approve appeared
          to do nothing. */}
      {confirmModal.visible ? (
        <View style={[styles.modalOverlay, styles.overlayFill]}>
          <View style={styles.backdrop} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.grabber} />
            {confirmModal.actionType && (
              <>
                <View
                  style={[
                    styles.sheetIcon,
                    ACTION_CONFIG[confirmModal.actionType].confirmVariant === 'danger' && styles.sheetIconDanger,
                  ]}
                >
                  <Ionicons
                    name={ACTION_CONFIG[confirmModal.actionType].icon}
                    size={26}
                    color={
                      ACTION_CONFIG[confirmModal.actionType].confirmVariant === 'danger'
                        ? palette.danger
                        : palette.text
                    }
                  />
                </View>
                <Text style={styles.confirmTitle}>
                  {ACTION_CONFIG[confirmModal.actionType].title}
                </Text>
                <Text style={styles.confirmMessage}>
                  {ACTION_CONFIG[confirmModal.actionType].message}
                  {confirmModal.cancelRefundLabel ? `\n\n${confirmModal.cancelRefundLabel}` : ''}
                </Text>
                {confirmModal.booking && (
                  <View style={styles.confirmBookingInfo}>
                    <Text style={styles.confirmBookingName}>
                      {confirmModal.booking.listingName}
                    </Text>
                    <Text style={styles.confirmBookingRenter}>
                      {confirmModal.booking.renterName} - {confirmModal.booking.vehicle.plate}
                    </Text>
                  </View>
                )}
                <View style={styles.confirmButtons}>
                  <PillButton
                    variant="grey"
                    label="Cancel"
                    onPress={handleCancelConfirm}
                    style={styles.confirmBtnLeft}
                  />
                  <PillButton
                    variant={ACTION_CONFIG[confirmModal.actionType].confirmVariant}
                    label={actionLoading ? 'Processing...' : ACTION_CONFIG[confirmModal.actionType].confirmText}
                    onPress={handleConfirmAction}
                    disabled={actionLoading}
                    style={styles.confirmBtnRight}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills the screen above everything, which is what <Modal> used to do.
  overlayFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    elevation: 24,
    zIndex: 9999,
  },
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  headerTitle: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 28,
    letterSpacing: -0.7,
    color: palette.text,
  },
  headerGap: { marginLeft: 10 },
  search: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: palette.surface,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 5,
    borderRadius: radii.pill,
    backgroundColor: palette.bgSoft,
  },
  tab: {
    flex: 1,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: 4,
  },
  tabActive: {
    backgroundColor: palette.surface,
    ...shadow.press,
  },
  tabText: {
    ...fonts.semibold,
    fontSize: 13.5,
    color: palette.textMuted,
    flexShrink: 1,
  },
  tabTextActive: { color: palette.text },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 4,
    backgroundColor: palette.surface,
  },
  tabBadgeActive: { backgroundColor: palette.ink },
  tabBadgeText: {
    ...fonts.bold,
    fontSize: 10,
    color: palette.text,
  },
  tabBadgeTextActive: { color: palette.textInverse },
  filtersContainer: {
    marginBottom: 12,
  },
  chipsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    gap: 6,
  },
  filterChipActive: { backgroundColor: palette.ink },
  filterChipText: {
    ...fonts.semibold,
    fontSize: 13.5,
    color: palette.text,
  },
  filterChipTextActive: { color: palette.textInverse },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginTop: 10,
    gap: 8,
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: palette.peachSoft,
    gap: 6,
  },
  summaryPillText: {
    ...fonts.semibold,
    fontSize: 12.5,
    color: palette.text,
  },
  pastStatusScroll: {
    marginTop: 10,
  },
  statusChip: {
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: palette.bgSoft,
  },
  statusChipActive: { backgroundColor: palette.ink },
  statusChipText: {
    ...fonts.semibold,
    fontSize: 12.5,
    color: palette.textMuted,
  },
  listContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  // Bottom sheets (overlays)
  modalOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sheetTitle: {
    ...fonts.semibold,
    fontSize: 22,
    color: palette.text,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  sheetOptionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  sheetOptionText: {
    ...fonts.medium,
    fontSize: 16,
    color: palette.text,
  },
  sheetOptionTextActive: { ...fonts.semibold },
  checkDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uncheckDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: palette.line,
  },
  sheetIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: palette.peachSoft,
  },
  sheetIconDanger: { backgroundColor: palette.dangerSoft },
  confirmTitle: {
    ...fonts.semibold,
    fontSize: 22,
    color: palette.text,
  },
  confirmMessage: {
    ...fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: palette.textMuted,
    marginTop: 6,
  },
  confirmBookingInfo: {
    marginTop: 16,
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: palette.fill,
  },
  confirmBookingName: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
    marginBottom: 3,
  },
  confirmBookingRenter: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
  },
  confirmButtons: {
    flexDirection: 'row',
    marginTop: 20,
  },
  confirmBtnLeft: { flex: 1, marginRight: 10 },
  confirmBtnRight: { flex: 1.4 },
});
