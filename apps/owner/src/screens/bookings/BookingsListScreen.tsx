import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  Modal,
  Platform,
  StatusBar,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
const EMPTY_STATE_CONFIG: Record<BookingTabType, { icon: string; title: string; subtitle: string }> = {
  requests: {
    icon: 'time-outline',
    title: 'No booking requests',
    subtitle: 'New booking requests will appear here for your approval',
  },
  upcoming: {
    icon: 'calendar-outline',
    title: 'No upcoming bookings',
    subtitle: 'Approved bookings scheduled for the future will show here',
  },
  active: {
    icon: 'car-outline',
    title: 'No active bookings',
    subtitle: 'Bookings currently in progress will appear here',
  },
  past: {
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
  confirmColor: string;
}

type ActionType = 'approve' | 'reject' | 'cancel' | 'complete' | 'noshow';

const ACTION_CONFIG: Record<ActionType, ActionConfig> = {
  approve: {
    title: 'Approve Booking',
    message: 'Are you sure you want to approve this booking request?',
    confirmText: 'Approve',
    confirmColor: '#10B981',
  },
  reject: {
    title: 'Reject Booking',
    message: 'Are you sure you want to reject this booking request? The renter will be notified.',
    confirmText: 'Reject',
    confirmColor: '#EF4444',
  },
  cancel: {
    title: 'Cancel Booking',
    message: 'Are you sure you want to cancel this booking?',
    confirmText: 'Cancel Booking',
    confirmColor: '#EF4444',
  },
  complete: {
    title: 'Check Out Renter',
    message: 'Check out the renter? Overtime charges (1.5×) apply if past the end time.',
    confirmText: 'Check Out',
    confirmColor: '#10B981',
  },
  noshow: {
    title: 'Mark No-Show',
    message: 'Mark the renter as a no-show? This will be recorded on the booking.',
    confirmText: 'Mark No-Show',
    confirmColor: '#F59E0B',
  },
};

export default function BookingsListScreen() {
  const theme = useMemo(() => getTheme(false), []);
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
          <View style={[styles.emptyIconContainer, { backgroundColor: theme.borderLight }]}>
            <Ionicons name="search-outline" size={48} color={theme.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No results found</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Try adjusting your filters or search term
          </Text>
          <Pressable
            style={[styles.clearFiltersButton, { backgroundColor: theme.primary }]}
            onPress={() => {
              setSearchText('');
              setDebouncedSearch('');
              setVehicleFilter('all');
              setDateRange('all');
              setPastStatusFilter('all');
            }}
          >
            <Text style={styles.clearFiltersText}>Clear Filters</Text>
          </Pressable>
        </Animated.View>
      );
    }

    return (
      <Animated.View entering={FadeIn} style={styles.emptyContainer}>
        <View style={[styles.emptyIconContainer, { backgroundColor: theme.borderLight }]}>
          <Ionicons name={config.icon} size={48} color={theme.textMuted} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>{config.title}</Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
          {config.subtitle}
        </Text>
      </Animated.View>
    );
  }, [selectedTab, debouncedSearch, vehicleFilter, dateRange, pastStatusFilter, theme]);

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
            <Pressable
              key={option.key}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isActive ? theme.primary : theme.surface,
                  borderColor: isActive ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setVehicleFilter(option.key)}
            >
              <Ionicons
                name={option.icon}
                size={14}
                color={isActive ? '#FFFFFF' : theme.textSecondary}
              />
              <Text
                style={[
                  styles.filterChipText,
                  { color: isActive ? '#FFFFFF' : theme.textSecondary },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Filter Row: Date Range + Sort + Status (for past tab) */}
      <View style={styles.filterRow}>
        {/* Date Range */}
        <Pressable
          style={[styles.filterButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => setShowDateModal(true)}
        >
          <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.filterButtonText, { color: theme.text }]}>
            {DATE_RANGE_OPTIONS.find((o) => o.key === dateRange)?.label || 'Date'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={theme.textMuted} />
        </Pressable>

        {/* Sort */}
        <Pressable
          style={[styles.filterButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => setShowSortModal(true)}
        >
          <Ionicons name="swap-vertical-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.filterButtonText, { color: theme.text }]}>Sort</Text>
          <Ionicons name="chevron-down" size={14} color={theme.textMuted} />
        </Pressable>

        {/* Past Status Filter (only for past tab) */}
        {selectedTab === 'past' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pastStatusScroll}
          >
            {PAST_STATUS_OPTIONS.map((option) => {
              const isActive = pastStatusFilter === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={[
                    styles.statusChip,
                    {
                      backgroundColor: isActive ? theme.primaryLight : theme.surface,
                      borderColor: isActive ? theme.primary : theme.border,
                    },
                  ]}
                  onPress={() => setPastStatusFilter(option.key)}
                >
                  <Text
                    style={[
                      styles.statusChipText,
                      { color: isActive ? theme.primary : theme.textSecondary },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  ), [vehicleFilter, dateRange, selectedTab, pastStatusFilter, theme]);

  // Render owner not set up state
  if (!owner?.id && !isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="calendar-outline" size={64} color={theme.textMuted} />
          <Text style={[styles.errorTitle, { color: theme.text }]}>Complete onboarding first</Text>
          <Text style={[styles.errorSubtitle, { color: theme.textSecondary }]}>
            Set up your owner profile to start managing bookings.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Render error state
  if (error && !isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.danger} />
          <Text style={[styles.errorTitle, { color: theme.text }]}>Something went wrong</Text>
          <Text style={[styles.errorSubtitle, { color: theme.textSecondary }]}>{error}</Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
            onPress={handleRetry}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Render loading state
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.background} />
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.background }]}>
          <View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Bookings</Text>
          </View>
        </View>
        <BookingsSkeleton count={4} showTabs showSearch showFilters />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Bookings</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
        <View style={[styles.searchInputContainer, { backgroundColor: theme.borderLight }]}>
          <Ionicons name="search-outline" size={20} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search bookings..."
            placeholderTextColor={theme.textMuted}
            value={searchText}
            onChangeText={setSearchText}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: theme.surface }]}>
        {TABS.map((tab) => {
          const isActive = selectedTab === tab.key;
          const count = tabCounts[tab.key];
          return (
            <Pressable
              key={tab.key}
              style={[
                styles.tab,
                isActive && { backgroundColor: theme.primary },
              ]}
              onPress={() => handleTabChange(tab.key)}
            >
              <View style={styles.tabContent}>
                <Text
                  style={[
                    styles.tabText,
                    { color: isActive ? '#FFFFFF' : theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
                {count > 0 && (
                  <View
                    style={[
                      styles.tabBadge,
                      {
                        backgroundColor: isActive ? 'rgba(255,255,255,0.3)' : theme.primary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabBadgeText,
                        { color: '#FFFFFF' },
                      ]}
                    >
                      {count > 99 ? '99+' : count}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Bookings List */}
      <FlatList
        data={filteredBookings}
        renderItem={renderBookingCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
      />

      {/* Sort Modal */}
      {showSortModal ? (

        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowSortModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Sort By</Text>
            {SORT_OPTIONS.map((option) => {
              const isActive = sortOption === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={[
                    styles.modalOption,
                    isActive && { backgroundColor: theme.primaryLight },
                  ]}
                  onPress={() => {
                    setSortOption(option.key);
                    setShowSortModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      { color: isActive ? theme.primary : theme.text },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark" size={20} color={theme.primary} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      
      ) : null}

      {/* Date Range Modal */}
      {showDateModal ? (

        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowDateModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Date Range</Text>
            {DATE_RANGE_OPTIONS.map((option) => {
              const isActive = dateRange === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={[
                    styles.modalOption,
                    isActive && { backgroundColor: theme.primaryLight },
                  ]}
                  onPress={() => {
                    setDateRange(option.key);
                    setShowDateModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      { color: isActive ? theme.primary : theme.text },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark" size={20} color={theme.primary} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      
      ) : null}

      {/* Confirm Action — an overlay, not a <Modal>: modals do not present on
          this build, so the confirmation was invisible and Approve appeared
          to do nothing. */}
      {confirmModal.visible ? (
        <View style={[styles.modalOverlay, styles.overlayFill]}>
          <View style={[styles.confirmModalContent, { backgroundColor: theme.surface }]}>
            {confirmModal.actionType && (
              <>
                <Text style={[styles.confirmTitle, { color: theme.text }]}>
                  {ACTION_CONFIG[confirmModal.actionType].title}
                </Text>
                <Text style={[styles.confirmMessage, { color: theme.textSecondary }]}>
                  {ACTION_CONFIG[confirmModal.actionType].message}
                  {confirmModal.cancelRefundLabel ? `\n\n${confirmModal.cancelRefundLabel}` : ''}
                </Text>
                {confirmModal.booking && (
                  <View style={[styles.confirmBookingInfo, { backgroundColor: theme.borderLight }]}>
                    <Text style={[styles.confirmBookingName, { color: theme.text }]}>
                      {confirmModal.booking.listingName}
                    </Text>
                    <Text style={[styles.confirmBookingRenter, { color: theme.textSecondary }]}>
                      {confirmModal.booking.renterName} - {confirmModal.booking.vehicle.plate}
                    </Text>
                  </View>
                )}
                <View style={styles.confirmButtons}>
                  <Pressable
                    style={[styles.confirmButton, styles.cancelButton, { borderColor: theme.border }]}
                    onPress={handleCancelConfirm}
                  >
                    <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.confirmButton,
                      { backgroundColor: ACTION_CONFIG[confirmModal.actionType].confirmColor },
                      actionLoading && { opacity: 0.7 },
                    ]}
                    onPress={handleConfirmAction}
                    disabled={actionLoading}
                  >
                    <Text style={styles.confirmButtonText}>
                      {actionLoading ? 'Processing...' : ACTION_CONFIG[confirmModal.actionType].confirmText}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
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
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold as any,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    marginTop: spacing[1],
  },
  searchContainer: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: Platform.OS === 'ios' ? spacing[3] : spacing[2],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    padding: 0,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing[4],
    padding: spacing[1],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[3],
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[1],
    borderRadius: borderRadius.md,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  tabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  tabBadgeText: {
    fontSize: 9,
    fontWeight: fontWeight.bold as any,
  },
  filtersContainer: {
    marginBottom: spacing[3],
  },
  chipsScrollContent: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    gap: spacing[1],
  },
  filterChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing[1],
  },
  filterButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  pastStatusScroll: {
    flex: 1,
  },
  statusChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: spacing[2],
  },
  statusChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  listContent: {
    paddingBottom: spacing[6],
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[12],
  },
  emptyIconContainer: {
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
  clearFiltersButton: {
    marginTop: spacing[4],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.lg,
  },
  clearFiltersText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  errorTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold as any,
    marginTop: spacing[4],
    marginBottom: spacing[2],
  },
  errorSubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing[4],
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
  // Modal styles
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: SCREEN_WIDTH - spacing[8],
    maxWidth: 340,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[3],
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[1],
  },
  modalOptionText: {
    fontSize: fontSize.base,
  },
  // Confirm modal styles
  confirmModalContent: {
    width: SCREEN_WIDTH - spacing[8],
    maxWidth: 360,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  confirmTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing[4],
  },
  confirmBookingInfo: {
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[4],
  },
  confirmBookingName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[1],
  },
  confirmBookingRenter: {
    fontSize: fontSize.sm,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  confirmButton: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
});
