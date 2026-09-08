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
  RefreshControl,
  Platform,
  Keyboard,
  StatusBar,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
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

// Range options
const RANGE_OPTIONS: { key: EarningsRangeOption; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'custom', label: 'Custom' },
];

// View mode options
const VIEW_MODES: { key: EarningsViewMode; label: string; icon: string }[] = [
  { key: 'overview',      label: 'Overview',      icon: 'grid-outline' },
  { key: 'transactions',  label: 'Transactions',  icon: 'list-outline' },
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
  const theme     = useMemo(() => getTheme(false), []);
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
      <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
        <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
          {section.data.length} transaction{section.data.length !== 1 ? 's' : ''}
        </Text>
      </View>
    ),
    [theme],
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
        <View style={[styles.emptyIcon, { backgroundColor: theme.borderLight }]}>
          <Ionicons
            name={hasFilters ? 'filter-outline' : 'wallet-outline'}
            size={48}
            color={theme.textMuted}
          />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>
          {hasFilters ? 'No matching transactions' : 'No transactions yet'}
        </Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
          {hasFilters
            ? 'Try adjusting your filters or search terms'
            : 'Your earnings will appear here once you receive bookings'}
        </Text>
        {hasFilters && (
          <Pressable
            style={[styles.clearFiltersButton, { backgroundColor: theme.primary }]}
            onPress={() => {
              applyFiltersInMemory({
                filters:    { status: [], payoutStatus: [], types: [], listingIds: [] },
                searchText: '',
              });
              setLocalSearchText('');
            }}
          >
            <Text style={styles.clearFiltersText}>Clear Filters</Text>
          </Pressable>
        )}
      </Animated.View>
    );
  }, [state.isLoading, state.uiState.filters, state.uiState.searchText, theme, applyFiltersInMemory]);

  const renderErrorState = useCallback(() => (
    <View style={styles.errorContainer}>
      <View style={[styles.errorIcon, { backgroundColor: theme.dangerLight }]}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.danger} />
      </View>
      <Text style={[styles.errorTitle, { color: theme.text }]}>Something went wrong</Text>
      <Text style={[styles.errorSubtitle, { color: theme.textSecondary }]}>{state.error}</Text>
      <Pressable
        style={[styles.retryButton, { backgroundColor: theme.primary }]}
        onPress={() => fetchEarningsData(state.uiState.selectedRange, state.uiState.customRange)}
      >
        <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
        <Text style={styles.retryText}>Try Again</Text>
      </Pressable>
    </View>
  ), [state.error, state.uiState, theme, fetchEarningsData]);

  // ──────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────

  if (state.isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.background} />
        <EarningsSkeleton />
      </SafeAreaView>
    );
  }

  if (state.error && !state.isRefreshing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={theme.background} />
        {renderErrorState()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={styles.header}>
        {navigation.canGoBack() ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.filterButton, { backgroundColor: theme.surface, marginRight: 8 }]}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
        ) : null}
        <Text style={[styles.headerTitle, { color: theme.text, flex: 1 }]}>Earnings</Text>
        <Pressable
          style={[styles.filterButton, { backgroundColor: theme.surface }]}
          onPress={handleFilterPress}
        >
          <Ionicons name="options-outline" size={20} color={theme.text} />
          {activeFilterCount > 0 && (
            <Animated.View
              style={[
                styles.filterBadge,
                { backgroundColor: theme.primary },
                filterBadgeStyle,
              ]}
            >
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </Animated.View>
          )}
        </Pressable>
      </View>

      {/* Range Selector */}
      <View style={styles.rangeContainer}>
        <View style={[styles.rangeSelector, { backgroundColor: theme.surface }]}>
          {RANGE_OPTIONS.map((option) => {
            const isSelected = state.uiState.selectedRange === option.key;
            return (
              <Pressable
                key={option.key}
                style={[
                  styles.rangeOption,
                  isSelected && [styles.rangeOptionSelected, { backgroundColor: theme.primary }],
                ]}
                onPress={() => handleRangeChange(option.key)}
              >
                <Text
                  style={[
                    styles.rangeOptionText,
                    { color: isSelected ? '#FFFFFF' : theme.textSecondary },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* View Mode Toggle */}
      <View style={styles.viewModeContainer}>
        {VIEW_MODES.map((mode) => {
          const isSelected = state.uiState.viewMode === mode.key;
          return (
            <Pressable
              key={mode.key}
              style={[
                styles.viewModeButton,
                { borderColor: isSelected ? theme.primary : theme.border },
                isSelected && { backgroundColor: theme.primaryLight },
              ]}
              onPress={() => handleViewModeChange(mode.key)}
            >
              <Ionicons
                name={mode.icon as any}
                size={16}
                color={isSelected ? theme.primary : theme.textSecondary}
              />
              <Text
                style={[
                  styles.viewModeText,
                  { color: isSelected ? theme.primary : theme.textSecondary },
                ]}
              >
                {mode.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Content */}
      {state.uiState.viewMode === 'overview' ? (
        <SectionList
          sections={[{ title: 'Recent', dateKey: 'recent', data: recentTransactions }]}
          keyExtractor={keyExtractor}
          renderItem={renderTransactionItem}
          renderSectionHeader={({ section }) =>
            recentTransactions.length > 0 ? (
              <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Recent Transactions
                </Text>
                <Pressable onPress={() => handleViewModeChange('transactions')}>
                  <Text style={[styles.viewAllText, { color: theme.primary }]}>View All</Text>
                </Pressable>
              </View>
            ) : null
          }
          ListHeaderComponent={
            <View>
              <EarningsSummaryCard
                summary={state.summary}
                rangeLabel={getRangeLabel(state.uiState.selectedRange, state.uiState.customRange)}
                testID="earnings-summary"
              />
              {state.dailyEarnings.length > 0 && (
                <EarningsChart dailyEarnings={state.dailyEarnings} title="Daily Earnings" />
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyRecentContainer}>
              <Text style={[styles.emptyRecentText, { color: theme.textMuted }]}>
                No recent transactions
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={state.isRefreshing}
              onRefresh={handleRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <>
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <View style={[styles.searchBar, { backgroundColor: theme.surface }]}>
              <Ionicons name="search-outline" size={18} color={theme.textMuted} />
              <TextInput
                ref={searchInputRef}
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Search transactions..."
                placeholderTextColor={theme.textMuted}
                value={localSearchText}
                onChangeText={handleSearchChange}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {localSearchText.length > 0 && (
                <Pressable onPress={handleClearSearch} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Transaction List */}
          <SectionList
            sections={state.sections}
            keyExtractor={keyExtractor}
            renderItem={renderTransactionItem}
            renderSectionHeader={renderSectionHeader}
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl
                refreshing={state.isRefreshing}
                onRefresh={handleRefresh}
                colors={[theme.primary]}
                tintColor={theme.primary}
              />
            }
            stickySectionHeadersEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.listContent,
              state.sections.length === 0 && styles.emptyListContent,
            ]}
            onScrollBeginDrag={Keyboard.dismiss}
          />
        </>
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
          theme={theme}
        />
      )}

      {/* Custom Date Range Modal */}
      {showDatePicker ? (

        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setShowDatePicker(false)}
        >
          <Pressable
            style={[styles.sheetContainer, { backgroundColor: theme.surface }]}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.sheetHandle}>
              <View style={[styles.handleBar, { backgroundColor: theme.border }]} />
            </View>
            <Text style={[styles.sheetTitle, { color: theme.text, paddingHorizontal: spacing[4], marginBottom: spacing[4] }]}>
              Custom Date Range
            </Text>

            <View style={{ paddingHorizontal: spacing[4] }}>
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

            <Pressable
              style={[styles.applyButton, { backgroundColor: theme.primary, margin: spacing[4] }]}
              onPress={handleApplyCustomRange}
            >
              <Text style={styles.applyButtonText}>Apply</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      
      ) : null}
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────────────────
// Filter Bottom Sheet Component (unchanged from original)
// ──────────────────────────────────────────────────────────────────

interface FilterBottomSheetProps {
  filters: EarningsUIState['filters'];
  sortOption: EarningsUIState['sortOption'];
  onClose: () => void;
  onApply: (filters: EarningsUIState['filters'], sortOption: EarningsUIState['sortOption']) => void;
  theme: ReturnType<typeof getTheme>;
}

function FilterBottomSheet({ filters, sortOption, onClose, onApply, theme }: FilterBottomSheetProps) {
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
        style={[styles.sheetContainer, { backgroundColor: theme.surface }]}
      >
        <Pressable onPress={e => e.stopPropagation()}>
          <View style={styles.sheetHandle}>
            <View style={[styles.handleBar, { backgroundColor: theme.border }]} />
          </View>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Filters & Sort</Text>
            <Pressable onPress={clearAll}>
              <Text style={[styles.clearAllText, { color: theme.primary }]}>Clear All</Text>
            </Pressable>
          </View>

          {/* Sort */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterSectionTitle, { color: theme.textSecondary }]}>Sort By</Text>
            <View style={styles.chipContainer}>
              {sortOptions.map(option => {
                const isSelected = localSortOption === option.key;
                return (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.chip,
                      { borderColor: isSelected ? theme.primary : theme.border },
                      isSelected && { backgroundColor: theme.primaryLight },
                    ]}
                    onPress={() => setLocalSortOption(option.key)}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? theme.primary : theme.textSecondary }]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Status */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterSectionTitle, { color: theme.textSecondary }]}>Transaction Status</Text>
            <View style={styles.chipContainer}>
              {statusOptions.map(option => {
                const isSelected = localFilters.status.includes(option.key);
                return (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.chip,
                      { borderColor: isSelected ? theme.primary : theme.border },
                      isSelected && { backgroundColor: theme.primaryLight },
                    ]}
                    onPress={() => toggleFilter('status', option.key)}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? theme.primary : theme.textSecondary }]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Payout */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterSectionTitle, { color: theme.textSecondary }]}>Payout Status</Text>
            <View style={styles.chipContainer}>
              {payoutOptions.map(option => {
                const isSelected = localFilters.payoutStatus.includes(option.key);
                return (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.chip,
                      { borderColor: isSelected ? theme.primary : theme.border },
                      isSelected && { backgroundColor: theme.primaryLight },
                    ]}
                    onPress={() => toggleFilter('payoutStatus', option.key)}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? theme.primary : theme.textSecondary }]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Type */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterSectionTitle, { color: theme.textSecondary }]}>Transaction Type</Text>
            <View style={styles.chipContainer}>
              {typeOptions.map(option => {
                const isSelected = localFilters.types.includes(option.key);
                return (
                  <Pressable
                    key={option.key}
                    style={[
                      styles.chip,
                      { borderColor: isSelected ? theme.primary : theme.border },
                      isSelected && { backgroundColor: theme.primaryLight },
                    ]}
                    onPress={() => toggleFilter('types', option.key)}
                  >
                    <Text style={[styles.chipText, { color: isSelected ? theme.primary : theme.textSecondary }]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            style={[styles.applyButton, { backgroundColor: theme.primary }]}
            onPress={() => onApply(localFilters, localSortOption)}
          >
            <Text style={styles.applyButtonText}>Apply Filters</Text>
          </Pressable>
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1 },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[4], paddingTop: spacing[2], paddingBottom: spacing[3] },
  headerTitle:        { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold as any },
  filterButton:       { width: 40, height: 40, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  filterBadge:        { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterBadgeText:    { color: '#FFFFFF', fontSize: 10, fontWeight: fontWeight.bold as any },
  rangeContainer:     { paddingHorizontal: spacing[4], marginBottom: spacing[3] },
  rangeSelector:      { flexDirection: 'row', borderRadius: borderRadius.lg, padding: spacing[1] },
  rangeOption:        { flex: 1, paddingVertical: spacing[2], alignItems: 'center', borderRadius: borderRadius.md },
  rangeOptionSelected: {},
  rangeOptionText:    { fontSize: fontSize.sm, fontWeight: fontWeight.medium as any },
  viewModeContainer:  { flexDirection: 'row', paddingHorizontal: spacing[4], marginBottom: spacing[3], gap: spacing[2] },
  viewModeButton:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing[2], borderRadius: borderRadius.lg, borderWidth: 1, gap: spacing[1] },
  viewModeText:       { fontSize: fontSize.sm, fontWeight: fontWeight.medium as any },
  searchContainer:    { paddingHorizontal: spacing[4], marginBottom: spacing[2] },
  searchBar:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: borderRadius.lg, gap: spacing[2] },
  searchInput:        { flex: 1, fontSize: fontSize.sm, padding: 0 },
  listContent:        { paddingBottom: spacing[6] },
  emptyListContent:   { flex: 1 },
  sectionHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  sectionTitle:       { fontSize: fontSize.sm, fontWeight: fontWeight.semibold as any },
  sectionSubtitle:    { fontSize: fontSize.xs },
  viewAllText:        { fontSize: fontSize.sm, fontWeight: fontWeight.medium as any },
  emptyContainer:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[6], paddingVertical: spacing[12] },
  emptyIcon:          { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[4] },
  emptyTitle:         { fontSize: fontSize.lg, fontWeight: fontWeight.semibold as any, textAlign: 'center', marginBottom: spacing[2] },
  emptySubtitle:      { fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },
  clearFiltersButton: { marginTop: spacing[4], paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: borderRadius.full },
  clearFiltersText:   { color: '#FFFFFF', fontSize: fontSize.sm, fontWeight: fontWeight.medium as any },
  emptyRecentContainer: { padding: spacing[6], alignItems: 'center' },
  emptyRecentText:    { fontSize: fontSize.sm },
  errorContainer:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[6] },
  errorIcon:          { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[4] },
  errorTitle:         { fontSize: fontSize.lg, fontWeight: fontWeight.semibold as any, textAlign: 'center', marginBottom: spacing[2] },
  errorSubtitle:      { fontSize: fontSize.sm, textAlign: 'center', marginBottom: spacing[4] },
  retryButton:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: borderRadius.full, gap: spacing[1] },
  retryText:          { color: '#FFFFFF', fontSize: fontSize.sm, fontWeight: fontWeight.medium as any },
  // Sheet / Modal
  sheetOverlay:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetContainer:     { borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, paddingBottom: Platform.OS === 'ios' ? 34 : spacing[4], maxHeight: '80%' },
  sheetHandle:        { alignItems: 'center', paddingVertical: spacing[3] },
  handleBar:          { width: 40, height: 4, borderRadius: 2 },
  sheetHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[4], marginBottom: spacing[4] },
  sheetTitle:         { fontSize: fontSize.lg, fontWeight: fontWeight.semibold as any },
  clearAllText:       { fontSize: fontSize.sm, fontWeight: fontWeight.medium as any },
  filterSection:      { paddingHorizontal: spacing[4], marginBottom: spacing[4] },
  filterSectionTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.medium as any, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing[2] },
  chipContainer:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip:               { paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: borderRadius.full, borderWidth: 1 },
  chipText:           { fontSize: fontSize.sm, fontWeight: fontWeight.medium as any },
  applyButton:        { marginHorizontal: spacing[4], marginTop: spacing[2], paddingVertical: spacing[3], borderRadius: borderRadius.lg, alignItems: 'center' },
  applyButtonText:    { color: '#FFFFFF', fontSize: fontSize.base, fontWeight: fontWeight.semibold as any },
  // Date input
  dateInputRow:       { paddingHorizontal: spacing[4], flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  dateInputLabel:     { fontSize: fontSize.sm, fontWeight: fontWeight.medium as any, width: 40 },
  dateInput:          { flex: 1, borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing[3], paddingVertical: spacing[2], fontSize: fontSize.sm },
});
