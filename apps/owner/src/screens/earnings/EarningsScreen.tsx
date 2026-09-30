import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Keyboard,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { DateField } from '../../components/inputs/DateField';
import { palette, radii, fonts } from '../../theme/kit';
import { PillButton, IconCircle, SearchPill, Segmented, Chip, SectionTitle, EmptyState } from '../../components/ui';
import {
  EarningsSummaryCard,
  TransactionItem,
  EarningsChart,
  EarningsSkeleton,
} from './components';
import type {
  EarningsTransaction,
  EarningsSummary,
  EarningsUIState,
  EarningsRangeOption,
  EarningsViewMode,
  TransactionSection,
  DailyEarnings,
  TransactionStatus,
  PayoutStatus,
  TransactionType,
  EarningsCustomRange,
} from '../../types/models';
import {
  getActiveFiltersCount,
  hasActiveFilters,
  getDateRangeForOption,
  filterAndSortTransactions,
  groupTransactionsByDay,
  calculateDailyEarnings,
} from '../../utils/storage';
import { useAuth } from '../../context/AuthContext';
import earningsService from '../../services/earningsService';
import { bookingService } from '../../services/bookingService';
import type { ApiBooking } from '../../types/api';
import { ROUTES } from '../../constants/routes';

const formatAmount = (amount: number, currency: string = 'INR'): string =>
  currency === 'INR' ? `₹${amount.toLocaleString('en-IN')}` : `${currency} ${amount.toLocaleString()}`;

// Range options
const RANGE_OPTIONS: { key: EarningsRangeOption; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'custom', label: 'Custom' },
];

// View mode options
const VIEW_MODES: { key: EarningsViewMode; label: string; icon: string }[] = [
  { key: 'overview',      label: 'Overview',      icon: 'grid' },
  { key: 'transactions',  label: 'Transactions',  icon: 'list' },
];

const getRangeLabel = (range: EarningsRangeOption, custom?: EarningsCustomRange): string => {
  switch (range) {
    case 'today':   return 'Today';
    case 'week':    return 'This Week';
    case 'month':   return 'This Month';
    case 'custom':
      if (custom?.fromISO && custom?.toISO) {
        const from = new Date(custom.fromISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const to   = new Date(custom.toISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return `${from} – ${to}`;
      }
      return 'Custom Range';
    default:        return '';
  }
};

/** Transform an ApiBooking to an EarningsTransaction for display */
function transformBookingToTransaction(b: ApiBooking): EarningsTransaction {
  const space = b.spaceId;
  const user  = b.userId;

  const propertyName = space?.propertyId?.propertyName ?? 'Unknown Property';
  const spaceNumber  = space?.spaceNumber ?? '—';
  const listingName  = `${propertyName} · ${spaceNumber}`;

  const renterName = user
    ? (user.legalName || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || undefined)
    : undefined;

  const isRefund = b.paymentStatus === 'refunded' || b.paymentStatus === 'partially_refunded';

  const statusMap: Record<ApiBooking['paymentStatus'], TransactionStatus> = {
    paid:               'completed',
    pending:            'pending',
    failed:             'failed',
    refunded:           'refunded',
    partially_refunded: 'refunded',
  };

  return {
    id:          b.id,
    createdAt:   b.checkOutTime ?? b.createdAt,
    amount:      isRefund ? -(b.discountAmount > 0 ? b.discountAmount : b.totalAmount) : b.totalAmount,
    currency:    'INR',
    status:      statusMap[b.paymentStatus] ?? 'completed',
    payoutStatus: b.status === 'completed' ? 'paid' : 'unpaid',
    type:        isRefund ? 'refund' : 'booking',
    listingId:   space?.id ?? '',
    listingName,
    bookingRef:  b.bookingNumber,
    renterName,
  };
}

interface EarningsScreenState {
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  uiState: EarningsUIState;
  summary: EarningsSummary;
  sections: TransactionSection[];
  dailyEarnings: DailyEarnings[];
  allTransactions: EarningsTransaction[];
}

const initialUIState: EarningsUIState = {
  selectedRange: 'week',
  viewMode: 'overview',
  filters: {
    status:       [],
    payoutStatus: [],
    types:        [],
    listingIds:   [],
  },
  searchText:  '',
  sortOption:  'newest',
};

const initialSummary: EarningsSummary = {
  gross:    0,
  fees:     0,
  net:      0,
  pending:  0,
  currency: 'INR',
};

export default function EarningsScreen() {
  const insets    = useSafeAreaInsets();
  const navigation = useNavigation();
  const { owner } = useAuth();
  const searchInputRef = useRef<TextInput>(null);

  const [state, setState] = useState<EarningsScreenState>({
    isLoading:        false,
    isRefreshing:     false,
    error:            null,
    uiState:          initialUIState,
    summary:          initialSummary,
    sections:         [],
    dailyEarnings:    [],
    allTransactions:  [],
  });

  const [showFilterSheet,   setShowFilterSheet]   = useState(false);
  const [showDatePicker,    setShowDatePicker]     = useState(false);
  const [localSearchText,   setLocalSearchText]    = useState('');
  const [customFromInput,   setCustomFromInput]    = useState('');
  const [customToInput,     setCustomToInput]      = useState('');

  const filterBadgeScale = useSharedValue(1);

  // ──────────────────────────────────────────────────────────────────
  // Core data fetching
  // ──────────────────────────────────────────────────────────────────

  /**
   * Fetch earnings data for the given range.
   * 1. Calls earnings endpoint for an accurate backend-calculated summary.
   * 2. Fetches all paid/refunded bookings for the transaction list.
   * Client-side filter/sort is applied on top of the fetched transactions.
   */
  const fetchEarningsData = useCallback(async (
    range: EarningsRangeOption,
    customRange?: EarningsCustomRange,
    currentUIState?: EarningsUIState,
    isRefresh = false,
  ) => {
    if (!owner?.id) return;

    setState(prev => ({
      ...prev,
      isLoading:   !isRefresh,
      isRefreshing: isRefresh,
      error:        null,
    }));

    try {
      const { start, end } = getDateRangeForOption(range, customRange);

      // Parallel: summary from earnings endpoint + bookings for transaction list
      const [earningsRes, bookingsRes] = await Promise.allSettled([
        earningsService.getOwnerEarnings(owner.id, start, end),
        bookingService.getOwnerBookings(owner.id, { limit: 200 }),
      ]);

      // Transform bookings → transactions (keep only ones with financial activity)
      let allTransactions: EarningsTransaction[] = [];
      if (bookingsRes.status === 'fulfilled') {
        allTransactions = bookingsRes.value.bookings
          .filter(b =>
            ['paid', 'refunded', 'partially_refunded'].includes(b.paymentStatus),
          )
          .map(transformBookingToTransaction);
      }

      // Summary from backend earnings endpoint (best accuracy for selected range)
      let summary: EarningsSummary = { ...initialSummary };
      if (earningsRes.status === 'fulfilled') {
        const es = earningsRes.value.earningsSummary;
        summary = {
          gross:    es?.totalEarnings  ?? 0,
          fees:     0,
          net:      es?.totalEarnings  ?? 0,
          pending:  es?.pendingEarnings ?? 0,
          currency: 'INR',
        };
      }

      // Use incoming or current uiState for filter/sort
      const uiState = currentUIState ?? state.uiState;

      // Apply filters/sort/search in memory
      const filteredTransactions = filterAndSortTransactions(allTransactions, {
        range,
        customRange,
        filters:    uiState.filters,
        searchText: uiState.searchText,
        sortOption: uiState.sortOption,
      });

      const sections      = groupTransactionsByDay(filteredTransactions);
      const chartDays     = range === 'today' ? 1 : range === 'month' ? 30 : 7;
      const dailyEarnings = calculateDailyEarnings(
        filteredTransactions,
        chartDays,
      );

      setState(prev => ({
        ...prev,
        isLoading:    false,
        isRefreshing: false,
        error:        null,
        uiState:      { ...prev.uiState, selectedRange: range, customRange },
        summary,
        sections,
        dailyEarnings,
        allTransactions,
      }));
    } catch (error) {
      console.error('Failed to load earnings data:', error);
      setState(prev => ({
        ...prev,
        isLoading:    false,
        isRefreshing: false,
        error:        'Failed to load earnings data. Please try again.',
      }));
    }
  }, [owner?.id]);

  // Initial load
  useEffect(() => {
    fetchEarningsData(initialUIState.selectedRange);
  }, [owner?.id]);

  // Refresh handler
  const handleRefresh = useCallback(() => {
    fetchEarningsData(
      state.uiState.selectedRange,
      state.uiState.customRange,
      state.uiState,
      true,
    );
  }, [state.uiState, fetchEarningsData]);

  // ──────────────────────────────────────────────────────────────────
  // UI state updates (filters / sort / search — no API call needed)
  // ──────────────────────────────────────────────────────────────────

  const applyFiltersInMemory = useCallback((updates: Partial<EarningsUIState>) => {
    setState(prev => {
      const newUIState = { ...prev.uiState, ...updates };
      const filtered   = filterAndSortTransactions(prev.allTransactions, {
        range:      newUIState.selectedRange,
        customRange: newUIState.customRange,
        filters:    newUIState.filters,
        searchText: newUIState.searchText,
        sortOption: newUIState.sortOption,
      });
      return {
        ...prev,
        uiState:  newUIState,
        sections: groupTransactionsByDay(filtered),
      };
    });
  }, []);

  // Range change — refetch from API for accurate summary
  const handleRangeChange = useCallback((range: EarningsRangeOption) => {
    if (range === 'custom') {
      setShowDatePicker(true);
      return;
    }
    fetchEarningsData(range, undefined, { ...state.uiState, selectedRange: range });
  }, [fetchEarningsData, state.uiState]);

  // View mode change
  const handleViewModeChange = useCallback((mode: EarningsViewMode) => {
    applyFiltersInMemory({ viewMode: mode });
  }, [applyFiltersInMemory]);

  // Search with debounce
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = useCallback((text: string) => {
    setLocalSearchText(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      applyFiltersInMemory({ searchText: text });
    }, 300);
  }, [applyFiltersInMemory]);

  const handleClearSearch = useCallback(() => {
    setLocalSearchText('');
    applyFiltersInMemory({ searchText: '' });
    searchInputRef.current?.blur();
  }, [applyFiltersInMemory]);

  // Transaction press — navigate to booking details
  const handleTransactionPress = useCallback((transaction: EarningsTransaction) => {
    (navigation as any).navigate(ROUTES.BOOKING_DETAILS, { bookingId: transaction.id });
  }, [navigation]);

  const handleFilterPress = useCallback(() => setShowFilterSheet(true), []);

  const activeFilterCount = useMemo(
    () => getActiveFiltersCount(state.uiState.filters),
    [state.uiState.filters],
  );

  // Animate filter badge
  const filterBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: filterBadgeScale.value }],
  }));

  useEffect(() => {
    if (activeFilterCount > 0) {
      filterBadgeScale.value = withTiming(1.2, { duration: 150 }, () => {
        filterBadgeScale.value = withTiming(1, { duration: 150 });
      });
    }
  }, [activeFilterCount, filterBadgeScale]);

  // ──────────────────────────────────────────────────────────────────
  // Custom date range picker
  // ──────────────────────────────────────────────────────────────────

  const handleApplyCustomRange = useCallback(() => {
    const fromDate = new Date(customFromInput);
    const toDate   = new Date(customToInput);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      AppAlert.alert('Invalid date', 'Please enter dates in DD/MM/YYYY format.');
      return;
    }
    if (toDate < fromDate) {
      AppAlert.alert('Invalid range', '"To" date must be after "From" date.');
      return;
    }

    const customRange: EarningsCustomRange = {
      fromISO: fromDate.toISOString(),
      toISO:   toDate.toISOString(),
    };
    setShowDatePicker(false);
    fetchEarningsData('custom', customRange, { ...state.uiState, selectedRange: 'custom', customRange });
  }, [customFromInput, customToInput, fetchEarningsData, state.uiState]);

  // ──────────────────────────────────────────────────────────────────
  // Render helpers
  // ──────────────────────────────────────────────────────────────────

  const renderSectionHeader = useCallback(
    ({ section }: { section: TransactionSection }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionSubtitle}>
          {section.data.length} transaction{section.data.length !== 1 ? 's' : ''}
        </Text>
      </View>
    ),
    [],
  );

  const renderTransactionItem = useCallback(
    ({ item, index, section }: { item: EarningsTransaction; index: number; section: TransactionSection }) => (
      <TransactionItem
        transaction={item}
        onPress={handleTransactionPress}
        isLast={index === section.data.length - 1}
        testID={`transaction-${item.id}`}
      />
    ),
    [handleTransactionPress],
  );

  const keyExtractor = useCallback((item: EarningsTransaction) => item.id, []);

  const recentTransactions = useMemo(() => state.allTransactions.slice(0, 5), [state.allTransactions]);

  const renderEmptyState = useCallback(() => {
    if (state.isLoading) return null;
    const hasFilters = hasActiveFilters(state.uiState.filters) || !!state.uiState.searchText;
    return (
      <Animated.View entering={FadeIn.duration(300)} style={styles.emptyContainer}>
        <EmptyState
          tone={hasFilters ? 'blue' : 'peach'}
          title={hasFilters ? 'No matching transactions' : 'No transactions yet'}
          subtitle={
            hasFilters
              ? 'Try adjusting your filters or search terms'
              : 'Your earnings will appear here once you receive bookings'
          }
          action={hasFilters ? 'Clear Filters' : undefined}
          onAction={() => {
            applyFiltersInMemory({
              filters:    { status: [], payoutStatus: [], types: [], listingIds: [] },
              searchText: '',
            });
            setLocalSearchText('');
          }}
        />
      </Animated.View>
    );
  }, [state.isLoading, state.uiState.filters, state.uiState.searchText, applyFiltersInMemory]);

  const renderErrorState = useCallback(() => (
    <View style={styles.errorContainer}>
      <EmptyState
        tone="grey"
        title="Something went wrong"
        subtitle={state.error}
        action="Try Again"
        onAction={() => fetchEarningsData(state.uiState.selectedRange, state.uiState.customRange)}
      />
    </View>
  ), [state.error, state.uiState, fetchEarningsData]);

  const canGoBack = navigation.canGoBack();
  const bottomPad = insets.bottom + 120;

  const renderTopBar = () => (
    <View style={styles.header}>
      {canGoBack ? (
        <IconCircle
          icon="arrow-left"
          size={46}
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        />
      ) : null}
      <Text style={styles.headerTitle}>Earnings</Text>
      <View>
        <IconCircle icon="sliders" size={46} onPress={handleFilterPress} />
        {activeFilterCount > 0 && (
          <Animated.View style={[styles.filterBadge, filterBadgeStyle]} pointerEvents="none">
            <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
          </Animated.View>
        )}
      </View>
    </View>
  );

  const listHeader = (
    <View>
      {/* Balance block */}
      <View style={styles.balance}>
        <Text style={styles.balanceLabel}>
          Net earnings · {getRangeLabel(state.uiState.selectedRange, state.uiState.customRange)}
        </Text>
        <View style={styles.balanceRow}>
          <Text style={styles.balanceValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatAmount(state.summary.net, state.summary.currency)}
          </Text>
          <PillButton
            label="Payouts"
            icon="arrow-up-right"
            variant="white"
            size="md"
            onPress={() => (navigation as any).navigate(ROUTES.PAYOUTS)}
          />
        </View>
        {state.summary.pending > 0 ? (
          <Text style={styles.balanceSub}>
            {formatAmount(state.summary.pending, state.summary.currency)} pending payout
          </Text>
        ) : null}
      </View>

      {/* Range */}
      <Segmented
        options={RANGE_OPTIONS.map(o => ({ id: o.key, label: o.label }))}
        value={state.uiState.selectedRange}
        onChange={(id: EarningsRangeOption) => handleRangeChange(id)}
        style={styles.segmented}
      />

      {/* View mode */}
      <View style={styles.viewModeRow}>
        {VIEW_MODES.map(mode => (
          <Chip
            key={mode.key}
            label={mode.label}
            icon={mode.icon}
            selected={state.uiState.viewMode === mode.key}
            onPress={() => handleViewModeChange(mode.key)}
          />
        ))}
      </View>
    </View>
  );

  // ──────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────

  if (state.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />
        {renderTopBar()}
        <EarningsSkeleton />
      </SafeAreaView>
    );
  }

  if (state.error && !state.isRefreshing) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />
        {renderTopBar()}
        {renderErrorState()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />

      {/* Header */}
      {renderTopBar()}

      {/* Content */}
      {state.uiState.viewMode === 'overview' ? (
        <SectionList
          sections={[{ title: 'Recent', dateKey: 'recent', data: recentTransactions }]}
          keyExtractor={keyExtractor}
          renderItem={renderTransactionItem}
          renderSectionHeader={() =>
            recentTransactions.length > 0 ? (
              <SectionTitle
                title="Recent transactions"
                action="View all"
                onAction={() => handleViewModeChange('transactions')}
                style={styles.recentHeader}
              />
            ) : null
          }
          ListHeaderComponent={
            <View>
              {listHeader}
              {state.dailyEarnings.length > 0 && (
                <EarningsChart dailyEarnings={state.dailyEarnings} title="Daily Earnings" />
              )}
              <EarningsSummaryCard
                summary={state.summary}
                rangeLabel={getRangeLabel(state.uiState.selectedRange, state.uiState.customRange)}
                testID="earnings-summary"
              />
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyRecentContainer}>
              <Text style={styles.emptyRecentText}>No recent transactions</Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={state.isRefreshing}
              onRefresh={handleRefresh}
              colors={[palette.ink]}
              tintColor={palette.ink}
            />
          }
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomPad }}
        />
      ) : (
        <SectionList
          sections={state.sections}
          keyExtractor={keyExtractor}
          renderItem={renderTransactionItem}
          renderSectionHeader={renderSectionHeader}
          ListHeaderComponent={
            <View>
              {listHeader}
              {/* Search Bar */}
              <View style={styles.searchContainer}>
                <SearchPill
                  ref={searchInputRef}
                  placeholder="Search transactions"
                  value={localSearchText}
                  onChangeText={handleSearchChange}
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.searchPill}
                  right={
                    localSearchText.length > 0 ? (
                      <Pressable onPress={handleClearSearch} hitSlop={8}>
                        <Ionicons name="close-circle" size={18} color={palette.textMuted} />
                      </Pressable>
                    ) : null
                  }
                />
              </View>
            </View>
          }
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={state.isRefreshing}
              onRefresh={handleRefresh}
              colors={[palette.ink]}
              tintColor={palette.ink}
            />
          }
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            { paddingBottom: bottomPad },
            state.sections.length === 0 && styles.emptyListContent,
          ]}
          onScrollBeginDrag={Keyboard.dismiss}
        />
      )}

      {/* Filter Bottom Sheet */}
      {showFilterSheet && (
        <FilterBottomSheet
          filters={state.uiState.filters}
          sortOption={state.uiState.sortOption}
          onClose={() => setShowFilterSheet(false)}
          onApply={(filters, sortOption) => {
            applyFiltersInMemory({ filters, sortOption });
            setShowFilterSheet(false);
          }}
        />
      )}

      {/* Custom Date Range Modal */}
      {showDatePicker ? (
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setShowDatePicker(false)}
        >
          <Pressable
            style={styles.sheetContainer}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.handleBar} />
            <Text style={[styles.sheetTitle, styles.sheetTitleSpaced]}>
              Custom date range
            </Text>

            <View style={styles.sheetBody}>
              <DateField
                label="From"
                value={customFromInput}
                onChange={setCustomFromInput}
                maxDate={customToInput ? new Date(customToInput) : new Date()}
                placeholder="Select start date"
              />
              <DateField
                label="To"
                value={customToInput}
                onChange={setCustomToInput}
                minDate={customFromInput ? new Date(customFromInput) : undefined}
                maxDate={new Date()}
                placeholder="Select end date"
              />
            </View>

            <View style={styles.sheetActions}>
              <PillButton
                label="Cancel"
                variant="grey"
                onPress={() => setShowDatePicker(false)}
                style={styles.sheetActionBtn}
              />
              <PillButton
                label="Apply"
                variant="ink"
                onPress={handleApplyCustomRange}
                style={styles.sheetActionBtn}
              />
            </View>
          </Pressable>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────────────────
// Filter Bottom Sheet Component
// ──────────────────────────────────────────────────────────────────

interface FilterBottomSheetProps {
  filters: EarningsUIState['filters'];
  sortOption: EarningsUIState['sortOption'];
  onClose: () => void;
  onApply: (filters: EarningsUIState['filters'], sortOption: EarningsUIState['sortOption']) => void;
}

function FilterBottomSheet({ filters, sortOption, onClose, onApply }: FilterBottomSheetProps) {
  const [localFilters, setLocalFilters]       = useState(filters);
  const [localSortOption, setLocalSortOption] = useState(sortOption);

  const toggleFilter = <K extends keyof typeof localFilters>(
    key: K,
    value: (typeof localFilters)[K][number],
  ) => {
    setLocalFilters(prev => {
      const arr    = prev[key] as any[];
      const newArr = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
      return { ...prev, [key]: newArr };
    });
  };

  const clearAll = () => {
    setLocalFilters({ status: [], payoutStatus: [], types: [], listingIds: [] });
    setLocalSortOption('newest');
  };

  const statusOptions:  { key: TransactionStatus; label: string }[] = [
    { key: 'completed', label: 'Completed' },
    { key: 'pending',   label: 'Pending' },
    { key: 'failed',    label: 'Failed' },
    { key: 'refunded',  label: 'Refunded' },
  ];
  const payoutOptions:  { key: PayoutStatus; label: string }[] = [
    { key: 'paid',       label: 'Paid' },
    { key: 'unpaid',     label: 'Unpaid' },
    { key: 'processing', label: 'Processing' },
  ];
  const typeOptions:    { key: TransactionType; label: string }[] = [
    { key: 'booking',          label: 'Booking' },
    { key: 'extension',        label: 'Extension' },
    { key: 'cancellation_fee', label: 'Cancellation' },
    { key: 'adjustment',       label: 'Adjustment' },
    { key: 'refund',           label: 'Refund' },
  ];
  const sortOptions: { key: typeof sortOption; label: string }[] = [
    { key: 'newest',      label: 'Newest First' },
    { key: 'oldest',      label: 'Oldest First' },
    { key: 'amount_high', label: 'Highest Amount' },
    { key: 'amount_low',  label: 'Lowest Amount' },
  ];

  return (
    <Pressable style={styles.sheetOverlay} onPress={onClose}>
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={styles.sheetContainer}
      >
        <Pressable onPress={e => e.stopPropagation()}>
          <View style={styles.handleBar} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filters & sort</Text>
            <TouchableOpacity onPress={clearAll} hitSlop={8} activeOpacity={0.7}>
              <Text style={styles.clearAllText}>Clear all</Text>
            </TouchableOpacity>
          </View>

          {/* Sort */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Sort by</Text>
            <View style={styles.chipContainer}>
              {sortOptions.map(option => (
                <Chip
                  key={option.key}
                  label={option.label}
                  selected={localSortOption === option.key}
                  onPress={() => setLocalSortOption(option.key)}
                  style={styles.sheetChip}
                />
              ))}
            </View>
          </View>

          {/* Status */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Transaction status</Text>
            <View style={styles.chipContainer}>
              {statusOptions.map(option => (
                <Chip
                  key={option.key}
                  label={option.label}
                  selected={localFilters.status.includes(option.key)}
                  onPress={() => toggleFilter('status', option.key)}
                  style={styles.sheetChip}
                />
              ))}
            </View>
          </View>

          {/* Payout */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Payout status</Text>
            <View style={styles.chipContainer}>
              {payoutOptions.map(option => (
                <Chip
                  key={option.key}
                  label={option.label}
                  selected={localFilters.payoutStatus.includes(option.key)}
                  onPress={() => toggleFilter('payoutStatus', option.key)}
                  style={styles.sheetChip}
                />
              ))}
            </View>
          </View>

          {/* Type */}
          <View style={styles.filterSection}>
            <Text style={styles.filterSectionTitle}>Transaction type</Text>
            <View style={styles.chipContainer}>
              {typeOptions.map(option => (
                <Chip
                  key={option.key}
                  label={option.label}
                  selected={localFilters.types.includes(option.key)}
                  onPress={() => toggleFilter('types', option.key)}
                  style={styles.sheetChip}
                />
              ))}
            </View>
          </View>

          <View style={styles.sheetActions}>
            <PillButton
              label="Apply filters"
              variant="ink"
              onPress={() => onApply(localFilters, localSortOption)}
              style={styles.sheetActionBtn}
            />
          </View>
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: palette.bg },
  header:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  backButton:         { marginRight: 12 },
  headerTitle:        { ...fonts.semibold, flex: 1, fontSize: 28, letterSpacing: -0.6, color: palette.text },
  filterBadge:        { position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, backgroundColor: palette.ink, borderWidth: 2, borderColor: palette.bg },
  filterBadgeText:    { ...fonts.bold, color: palette.textInverse, fontSize: 10 },

  balance:            { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18 },
  balanceLabel:       { ...fonts.medium, fontSize: 15, color: palette.text },
  balanceRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 12 },
  balanceValue:       { ...fonts.semibold, flex: 1, fontSize: 40, letterSpacing: -1, color: palette.text },
  balanceSub:         { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginTop: 4 },

  segmented:          { marginHorizontal: 16, marginBottom: 12, backgroundColor: palette.bgSoft },
  viewModeRow:        { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16 },

  searchContainer:    { paddingHorizontal: 16, marginBottom: 8 },
  searchPill:         { backgroundColor: palette.surface },
  emptyListContent:   { flexGrow: 1 },
  sectionHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  sectionTitle:       { ...fonts.semibold, fontSize: 16, color: palette.text },
  sectionSubtitle:    { ...fonts.medium, fontSize: 12, color: palette.textMuted },
  recentHeader:       { paddingHorizontal: 20, marginTop: 4, marginBottom: 12 },
  emptyContainer:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  emptyRecentContainer: { marginHorizontal: 16, padding: 24, alignItems: 'center', borderRadius: radii.xl, backgroundColor: palette.surface },
  emptyRecentText:    { ...fonts.medium, fontSize: 14, color: palette.textMuted },
  errorContainer:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },

  // Sheet / Modal
  sheetOverlay:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetContainer:     { backgroundColor: palette.surface, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16, maxHeight: '85%' },
  handleBar:          { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: palette.line, marginBottom: 18 },
  sheetHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 18 },
  sheetTitle:         { ...fonts.semibold, fontSize: 22, letterSpacing: -0.4, color: palette.text },
  sheetTitleSpaced:   { paddingHorizontal: 20, marginBottom: 16 },
  sheetBody:          { paddingHorizontal: 20 },
  clearAllText:       { ...fonts.semibold, fontSize: 14, color: palette.textMuted },
  filterSection:      { paddingHorizontal: 20, marginBottom: 18 },
  filterSectionTitle: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginBottom: 10 },
  chipContainer:      { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  sheetChip:          { backgroundColor: palette.fill },
  sheetActions:       { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 8 },
  sheetActionBtn:     { flex: 1 },
});
