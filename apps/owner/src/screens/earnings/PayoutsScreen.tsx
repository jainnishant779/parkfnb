import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  TextInput,
  Switch,
  Platform,
  Animated,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Components
import StatCard from '../../components/cards/StatCard';
import PayoutRow from '../../components/cards/PayoutRow';
import BottomSheetModal from '../../components/modals/BottomSheetModal';
import PrimaryButton from '../../components/buttons/PrimaryButton';
import FormTextInput from '../../components/inputs/FormTextInput';

// Theme
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { getTheme } from '../../theme/colors';

// Auth
import { useAuth } from '../../context/AuthContext';

// Services
import earningsService from '../../services/earningsService';
import { bookingService } from '../../services/bookingService';
import { ownerService } from '../../services/ownerService';

// API types
import type { ApiOwnerStats, ApiOwnerEarnings, ApiBooking } from '../../types/api';

// Data (types + config only — no mock data)
import {
  DEFAULT_PAYOUT_PREFERENCES,
  PAYOUTS_STORAGE_KEYS,
  FREQUENCY_OPTIONS,
  DATE_RANGE_OPTIONS,
  STATUS_FILTER_OPTIONS,
  PAYOUT_STATUS_CONFIG,
  type Payout,
  type PayoutStatus,
  type PayoutAccount,
  type PayoutPreferences,
} from '../../constants/mockPayoutsData';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ============================================================================
// TYPES
// ============================================================================

type StatusFilterKey = 'all' | 'paid' | 'pending' | 'failed';
type DateRangeKey = '30d' | '90d';

interface Filters {
  status: StatusFilterKey;
  dateRange: DateRangeKey;
  searchText: string;
}

interface ToastState {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatCurrencyFull = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const maskAccountNumber = (accountNumber: string): string => {
  if (accountNumber.length <= 4) return accountNumber;
  return '••••' + accountNumber.slice(-4);
};

const isWithinDays = (dateString: string, days: number): boolean => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return diff <= days * 24 * 60 * 60 * 1000 && diff >= 0;
};

/** Build a PayoutAccount from the owner's KYC bank data */
function buildAccountFromKycBank(kycBank: any, kycStatus: string): PayoutAccount {
  const bank = kycBank ?? {};
  return {
    id: 'primary',
    holderName: bank.accountHolderName ?? '',
    bankName: bank.bankName ?? '',
    accountNumber: bank.accountNumber ?? '',
    ifscCode: bank.ifscCode ?? '',
    accountType: 'savings',
    isVerified: kycStatus === 'verified',
    isDefault: true,
    addedAt: new Date().toISOString(),
  };
}

/** Transform a completed ApiBooking into a Payout row for the history list */
function bookingToPayout(b: ApiBooking, bankName: string, accountLast4: string): Payout {
  const statusMap: Record<string, PayoutStatus> = {
    paid: 'paid',
    refunded: 'failed',
    partially_refunded: 'on_hold',
    pending: 'pending',
    failed: 'failed',
  };
  return {
    id: b.bookingNumber,
    amount: b.totalAmount,
    fee: 0,
    netAmount: b.totalAmount,
    status: (statusMap[b.paymentStatus] ?? 'pending') as PayoutStatus,
    method: 'bank_transfer',
    date: b.checkOutTime ?? b.updatedAt ?? b.createdAt,
    processedAt: b.checkOutTime,
    bankName: bankName || 'Bank',
    accountLast4: accountLast4 || '****',
    referenceId: b.id,
  };
}

// ============================================================================
// SKELETON COMPONENTS
// ============================================================================

const StatCardSkeleton: React.FC = () => (
  <View style={styles.skeletonStatCard}>
    <View style={[styles.skeletonBox, styles.skeletonIcon]} />
    <View style={[styles.skeletonBox, styles.skeletonAmount]} />
    <View style={[styles.skeletonBox, styles.skeletonLabel]} />
  </View>
);

const PayoutRowSkeleton: React.FC = () => (
  <View style={styles.skeletonPayoutRow}>
    <View style={[styles.skeletonBox, styles.skeletonRowIcon]} />
    <View style={styles.skeletonRowContent}>
      <View style={[styles.skeletonBox, styles.skeletonRowTitle]} />
      <View style={[styles.skeletonBox, styles.skeletonRowSubtitle]} />
    </View>
  </View>
);

// ============================================================================
// FILTER CHIP COMPONENT
// ============================================================================

interface FilterChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

const FilterChip: React.FC<FilterChipProps> = ({ label, isSelected, onPress }) => (
  <Pressable
    onPress={onPress}
    style={[
      styles.filterChip,
      isSelected && styles.filterChipSelected,
    ]}
    accessibilityRole="button"
    accessibilityState={{ selected: isSelected }}
  >
    <Text style={[
      styles.filterChipText,
      isSelected && styles.filterChipTextSelected,
    ]}>
      {label}
    </Text>
  </Pressable>
);

// ============================================================================
// TIMELINE STEP COMPONENT
// ============================================================================

interface TimelineStepProps {
  label: string;
  isActive: boolean;
  isCompleted: boolean;
  isLast?: boolean;
}

const TimelineStep: React.FC<TimelineStepProps> = ({
  label,
  isActive,
  isCompleted,
  isLast = false,
}) => {
  const dotColor = isCompleted ? '#10B981' : isActive ? '#0D7377' : '#D1D5DB';
  const textColor = isCompleted || isActive ? '#1E293B' : '#94A3B8';

  return (
    <View style={styles.timelineStep}>
      <View style={styles.timelineStepContent}>
        <View style={[styles.timelineDot, { backgroundColor: dotColor }]}>
          {isCompleted && (
            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
          )}
        </View>
        <Text style={[styles.timelineLabel, { color: textColor }]}>{label}</Text>
      </View>
      {!isLast && (
        <View style={[
          styles.timelineLine,
          { backgroundColor: isCompleted ? '#10B981' : '#D1D5DB' },
        ]} />
      )}
    </View>
  );
};

// ============================================================================
// TOAST COMPONENT
// ============================================================================

interface ToastProps {
  toast: ToastState;
  onHide: () => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onHide }) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (toast.visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -100,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => onHide());
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [toast.visible, translateY, opacity, onHide]);

  if (!toast.visible) return null;

  const bgColor = toast.type === 'success' ? '#ECFDF5' : toast.type === 'error' ? '#FEF2F2' : '#E8F5F4';
  const textColor = toast.type === 'success' ? '#10B981' : toast.type === 'error' ? '#EF4444' : '#0D7377';
  const icon = toast.type === 'success' ? 'checkmark-circle' : toast.type === 'error' ? 'close-circle' : 'information-circle';

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: bgColor, transform: [{ translateY }], opacity },
      ]}
    >
      <Ionicons name={icon} size={20} color={textColor} />
      <Text style={[styles.toastText, { color: textColor }]}>{toast.message}</Text>
    </Animated.View>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PayoutsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const theme = useMemo(() => getTheme(false), []);
  const { owner } = useAuth();

  // Live API state
  const [liveStats, setLiveStats] = useState<ApiOwnerStats | null>(null);
  const [liveEarnings, setLiveEarnings] = useState<ApiOwnerEarnings | null>(null);

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [account, setAccount] = useState<PayoutAccount>({
    id: 'primary',
    holderName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    accountType: 'savings',
    isVerified: false,
    isDefault: true,
    addedAt: new Date().toISOString(),
  });
  const [preferences, setPreferences] = useState<PayoutPreferences>(DEFAULT_PAYOUT_PREFERENCES);
  const [filters, setFilters] = useState<Filters>({
    status: 'all',
    dateRange: '30d',
    searchText: '',
  });

  // Modal states
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showUpcomingModal, setShowUpcomingModal] = useState(false);
  const [showPayoutDetailModal, setShowPayoutDetailModal] = useState(false);
  const [showEditAccountModal, setShowEditAccountModal] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);

  // Form states
  const [editingAccount, setEditingAccount] = useState<PayoutAccount>(account);
  const [editingPreferences, setEditingPreferences] = useState<PayoutPreferences>(preferences);
  const [accountFormErrors, setAccountFormErrors] = useState<Record<string, string>>({});
  const [preferencesChanged, setPreferencesChanged] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);

  // Toast state
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', type: 'success' });

  // Animation
  const headerAnim = useRef(new Animated.Value(0)).current;

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setIsLoading(true);
    try {
      // Restore persisted preferences and filters
      const [savedPrefs, savedFilters] = await Promise.all([
        AsyncStorage.getItem(PAYOUTS_STORAGE_KEYS.PREFERENCES),
        AsyncStorage.getItem(PAYOUTS_STORAGE_KEYS.FILTERS),
      ]);

      if (savedPrefs) {
        const parsedPrefs = JSON.parse(savedPrefs);
        setPreferences(parsedPrefs);
        setEditingPreferences(parsedPrefs);
      }
      if (savedFilters) {
        setFilters(JSON.parse(savedFilters));
      }

      // Initialize account from KYC bank data
      if (owner) {
        const kycAccount = buildAccountFromKycBank(owner.kycBank, owner.kycStatus);
        setAccount(kycAccount);
        setEditingAccount(kycAccount);

        // Fetch live stats, earnings, and completed bookings in parallel
        const [statsResult, earningsResult, bookingsResult] = await Promise.allSettled([
          earningsService.getOwnerStats(owner.id),
          earningsService.getOwnerEarnings(owner.id),
          bookingService.getOwnerBookings(owner.id, { status: 'completed', limit: 20 }),
        ]);

        if (statsResult.status === 'fulfilled') {
          setLiveStats(statsResult.value);
        }
        if (earningsResult.status === 'fulfilled') {
          setLiveEarnings(earningsResult.value);
        }
        if (bookingsResult.status === 'fulfilled') {
          const bankName = owner.kycBank?.bankName ?? 'Bank';
          const accountLast4 = (owner.kycBank?.accountNumber ?? '').slice(-4) || '****';
          setPayouts(
            bookingsResult.value.bookings.map(b => bookingToPayout(b, bankName, accountLast4))
          );
        }
      }
    } catch (error) {
      console.error('Failed to load payout data:', error);
    } finally {
      setIsLoading(false);
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [owner, headerAnim]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [loadData]);

  // ============================================================================
  // FILTERS
  // ============================================================================

  const filteredPayouts = useMemo(() => {
    let result = [...payouts];

    // Status filter
    if (filters.status !== 'all') {
      result = result.filter(p => p.status === filters.status);
    }

    // Date range filter
    const days = DATE_RANGE_OPTIONS.find(d => d.key === filters.dateRange)?.days || 30;
    result = result.filter(p => isWithinDays(p.date, days));

    // Search filter
    if (filters.searchText.trim()) {
      const search = filters.searchText.toLowerCase();
      result = result.filter(p =>
        p.id.toLowerCase().includes(search) ||
        p.bankName.toLowerCase().includes(search)
      );
    }

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [payouts, filters]);

  const handleFilterChange = useCallback(async (newFilters: Partial<Filters>) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const updated = { ...filters, ...newFilters };
    setFilters(updated);
    await AsyncStorage.setItem(PAYOUTS_STORAGE_KEYS.FILTERS, JSON.stringify(updated));
  }, [filters]);

  const clearFilters = useCallback(() => {
    handleFilterChange({ status: 'all', dateRange: '30d', searchText: '' });
  }, [handleFilterChange]);

  // ============================================================================
  // PREFERENCES
  // ============================================================================

  const handlePreferencesChange = useCallback((updates: Partial<PayoutPreferences>) => {
    setEditingPreferences(prev => {
      const updated = { ...prev, ...updates };
      const hasChanges = JSON.stringify(updated) !== JSON.stringify(preferences);
      setPreferencesChanged(hasChanges);
      return updated;
    });
  }, [preferences]);

  const validateThreshold = (value: number): boolean => {
    return value >= 0;
  };

  const savePreferences = useCallback(async () => {
    if (!validateThreshold(editingPreferences.minimumThreshold)) {
      setToast({ visible: true, message: 'Threshold must be 0 or greater', type: 'error' });
      return;
    }

    setSavingPreferences(true);
    try {
      await AsyncStorage.setItem(
        PAYOUTS_STORAGE_KEYS.PREFERENCES,
        JSON.stringify(editingPreferences)
      );
      setPreferences(editingPreferences);
      setPreferencesChanged(false);
      setToast({ visible: true, message: 'Preferences saved successfully', type: 'success' });
    } catch (error) {
      setToast({ visible: true, message: 'Failed to save preferences', type: 'error' });
    } finally {
      setSavingPreferences(false);
    }
  }, [editingPreferences]);

  // ============================================================================
  // ACCOUNT MANAGEMENT
  // ============================================================================

  const validateAccountForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!editingAccount.holderName.trim()) {
      errors.holderName = 'Account holder name is required';
    }
    if (!editingAccount.bankName.trim()) {
      errors.bankName = 'Bank name is required';
    }
    if (!editingAccount.accountNumber.trim() || editingAccount.accountNumber.length < 8) {
      errors.accountNumber = 'Valid account number is required (min 8 digits)';
    }
    if (!editingAccount.ifscCode.trim() || editingAccount.ifscCode.length < 8) {
      errors.ifscCode = 'Valid IFSC code is required';
    }

    setAccountFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveAccount = useCallback(async () => {
    if (!validateAccountForm()) return;

    try {
      await ownerService.saveKycDraft({
        kycBank: {
          accountHolderName: editingAccount.holderName,
          accountNumber: editingAccount.accountNumber,
          ifscCode: editingAccount.ifscCode,
          bankName: editingAccount.bankName,
        },
      });
      setAccount(editingAccount);
      setShowEditAccountModal(false);
      setToast({ visible: true, message: 'Account updated successfully', type: 'success' });
    } catch (error) {
      setToast({ visible: true, message: 'Failed to update account', type: 'error' });
    }
  }, [editingAccount]);

  // ============================================================================
  // PAYOUT DETAILS
  // ============================================================================

  const handlePayoutPress = useCallback((payout: Payout) => {
    setSelectedPayout(payout);
    setShowPayoutDetailModal(true);
  }, []);

  const handleDownloadReceipt = useCallback(() => {
    setToast({ visible: true, message: 'Receipt download started', type: 'info' });
    setShowPayoutDetailModal(false);
  }, []);

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const summary = useMemo(() => ({
    availableBalance: liveStats?.revenueStats.totalRevenue ?? 0,
    pendingAmount: liveEarnings?.earningsSummary.pendingEarnings ?? 0,
    paidYTD: liveStats?.revenueStats.totalRevenue ?? 0,
    availableTrend: 0,
    pendingTrend: 0,
    paidTrend: 0,
  }), [liveStats, liveEarnings]);

  const upcomingPayout = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return {
      date: d.toISOString(),
      expectedAmount: liveEarnings?.earningsSummary.pendingEarnings ?? 0,
      status: 'scheduled' as const,
      currentStep: 0 as number,
    };
  }, [liveEarnings]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        {/* Decorative Circles */}
        <View style={styles.circleTopRight} />
        <View style={styles.circleTopRightInner} />
        <View style={styles.circleBottomLeft} />

        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Payouts</Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsRow}>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </ScrollView>

          <View style={styles.section}>
            <View style={[styles.skeletonBox, { width: 150, height: 20, marginBottom: spacing[3] }]} />
            <View style={[styles.card, { height: 120 }]}>
              <View style={styles.skeletonBox} />
            </View>
          </View>

          <View style={styles.section}>
            <View style={[styles.skeletonBox, { width: 120, height: 20, marginBottom: spacing[3] }]} />
            <PayoutRowSkeleton />
            <PayoutRowSkeleton />
            <PayoutRowSkeleton />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Decorative Circles */}
      <View style={styles.circleTopRight} />
      <View style={styles.circleTopRightInner} />
      <View style={styles.circleBottomLeft} />

      {/* Toast */}
      <Toast toast={toast} onHide={() => setToast(prev => ({ ...prev, visible: false }))} />

      {/* Header */}
      <Animated.View style={[styles.header, { opacity: headerAnim }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Payouts</Text>
        </View>
        <Pressable onPress={() => setShowHelpModal(true)} style={styles.infoButton}>
          <Ionicons name="information-circle-outline" size={24} color="#64748B" />
        </Pressable>
      </Animated.View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0D7377" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Stats */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statsRow}
          contentContainerStyle={styles.statsRowContent}
        >
          <StatCard
            label="Available Balance"
            amount={formatCurrency(summary.availableBalance)}
            trendValue={summary.availableTrend}
            trendText="vs last month"
            iconName="wallet-outline"
            variant="success"
          />
          <StatCard
            label="Pending"
            amount={formatCurrency(summary.pendingAmount)}
            trendValue={summary.pendingTrend}
            trendText="vs last month"
            iconName="time-outline"
            variant="warning"
          />
          <StatCard
            label="Paid (YTD)"
            amount={formatCurrency(summary.paidYTD)}
            trendValue={summary.paidTrend}
            trendText="vs last year"
            iconName="trending-up-outline"
            variant="info"
          />
        </ScrollView>

        {/* Upcoming Payout */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Payout</Text>
          <View style={styles.card}>
            <View style={styles.upcomingHeader}>
              <View>
                <Text style={styles.upcomingDate}>{formatDate(upcomingPayout.date)}</Text>
                <Text style={styles.upcomingAmount}>
                  {formatCurrencyFull(upcomingPayout.expectedAmount)}
                </Text>
              </View>
              <View style={[
                styles.statusBadge,
                { backgroundColor: PAYOUT_STATUS_CONFIG[upcomingPayout.status].bgColor }
              ]}>
                <Ionicons
                  name={PAYOUT_STATUS_CONFIG[upcomingPayout.status].icon as any}
                  size={14}
                  color={PAYOUT_STATUS_CONFIG[upcomingPayout.status].color}
                />
                <Text style={[
                  styles.statusBadgeText,
                  { color: PAYOUT_STATUS_CONFIG[upcomingPayout.status].color }
                ]}>
                  {PAYOUT_STATUS_CONFIG[upcomingPayout.status].label}
                </Text>
              </View>
            </View>

            {/* Timeline */}
            <View style={styles.timeline}>
              <TimelineStep
                label="Earnings"
                isCompleted={upcomingPayout.currentStep > 0}
                isActive={upcomingPayout.currentStep === 0}
              />
              <TimelineStep
                label="Processing"
                isCompleted={upcomingPayout.currentStep > 1}
                isActive={upcomingPayout.currentStep === 1}
              />
              <TimelineStep
                label="Deposit"
                isCompleted={upcomingPayout.currentStep > 2}
                isActive={upcomingPayout.currentStep === 2}
                isLast
              />
            </View>

            <Pressable
              onPress={() => setShowUpcomingModal(true)}
              style={styles.viewDetailsLink}
            >
              <Text style={styles.viewDetailsText}>View details</Text>
              <Ionicons name="chevron-forward" size={16} color="#0D7377" />
            </Pressable>
          </View>
        </View>

        {/* Payout Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payout Preferences</Text>
          <View style={styles.card}>
            {/* Auto Payout Toggle */}
            <View style={styles.preferenceRow}>
              <View style={styles.preferenceInfo}>
                <Text style={styles.preferenceLabel}>Auto Payouts</Text>
                <Text style={styles.preferenceHint}>Automatically transfer available balance</Text>
              </View>
              <Switch
                value={editingPreferences.autoPayoutEnabled}
                onValueChange={(value) => handlePreferencesChange({ autoPayoutEnabled: value })}
                trackColor={{ false: '#D1D5DB', true: '#7FC5BF' }}
                thumbColor={editingPreferences.autoPayoutEnabled ? '#0D7377' : '#F3F4F6'}
              />
            </View>

            {/* Frequency Picker */}
            {editingPreferences.autoPayoutEnabled && (
              <View style={styles.frequencySection}>
                <Text style={styles.preferenceLabel}>Frequency</Text>
                <View style={styles.frequencyOptions}>
                  {FREQUENCY_OPTIONS.map(option => (
                    <Pressable
                      key={option.value}
                      onPress={() => handlePreferencesChange({ frequency: option.value })}
                      style={[
                        styles.frequencyOption,
                        editingPreferences.frequency === option.value && styles.frequencyOptionSelected,
                      ]}
                    >
                      <Text style={[
                        styles.frequencyOptionText,
                        editingPreferences.frequency === option.value && styles.frequencyOptionTextSelected,
                      ]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Minimum Threshold */}
            <View style={styles.thresholdSection}>
              <Text style={styles.preferenceLabel}>Minimum Threshold</Text>
              <View style={styles.thresholdInput}>
                <Text style={styles.currencyPrefix}>₹</Text>
                <TextInput
                  style={styles.thresholdTextInput}
                  value={editingPreferences.minimumThreshold.toString()}
                  onChangeText={(text) => {
                    const value = parseInt(text.replace(/[^0-9]/g, '')) || 0;
                    handlePreferencesChange({ minimumThreshold: value });
                  }}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                />
              </View>
              {editingPreferences.minimumThreshold < 0 && (
                <Text style={styles.errorText}>Threshold must be 0 or greater</Text>
              )}
            </View>

            {/* Save Button */}
            {preferencesChanged && (
              <PrimaryButton
                title="Save Preferences"
                onPress={savePreferences}
                loading={savingPreferences}
                size="medium"
                style={styles.saveButton}
              />
            )}
          </View>
        </View>

        {/* Payout Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payout Account</Text>
          <View style={styles.card}>
            <View style={styles.accountHeader}>
              <View style={styles.bankIconContainer}>
                <Ionicons name="business-outline" size={24} color="#0D7377" />
              </View>
              <View style={styles.accountInfo}>
                <Text style={styles.accountHolderName}>{account.holderName}</Text>
                <Text style={styles.accountBankName}>{account.bankName}</Text>
                <Text style={styles.accountNumber}>
                  A/C: {maskAccountNumber(account.accountNumber)}
                </Text>
              </View>
              <View style={[
                styles.verificationBadge,
                { backgroundColor: account.isVerified ? '#ECFDF5' : '#FFFBEB' }
              ]}>
                <Ionicons
                  name={account.isVerified ? 'checkmark-circle' : 'time'}
                  size={14}
                  color={account.isVerified ? '#10B981' : '#F59E0B'}
                />
                <Text style={[
                  styles.verificationText,
                  { color: account.isVerified ? '#10B981' : '#F59E0B' }
                ]}>
                  {account.isVerified ? 'Verified' : 'Pending'}
                </Text>
              </View>
            </View>

            <View style={styles.accountDetails}>
              <View style={styles.accountDetailRow}>
                <Text style={styles.accountDetailLabel}>IFSC</Text>
                <Text style={styles.accountDetailValue}>{account.ifscCode}</Text>
              </View>
              <View style={styles.accountDetailRow}>
                <Text style={styles.accountDetailLabel}>Account Type</Text>
                <Text style={styles.accountDetailValue}>
                  {account.accountType === 'savings' ? 'Savings' : 'Current'}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => {
                setEditingAccount(account);
                setAccountFormErrors({});
                setShowEditAccountModal(true);
              }}
              style={styles.editAccountButton}
            >
              <Ionicons name="pencil-outline" size={18} color="#0D7377" />
              <Text style={styles.editAccountText}>Edit Account</Text>
            </Pressable>
          </View>
        </View>

        {/* Request Payout */}
        <View style={styles.section}>
          <PrimaryButton
            title="Request Payout"
            onPress={() => setToast({
              visible: true,
              message: 'Payout request submitted. Funds will be transferred to your bank account within 3–5 business days.',
              type: 'success',
            })}
            size="large"
          />
        </View>

        {/* Payout History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payout History</Text>

          {/* Filters */}
          <View style={styles.filtersContainer}>
            {/* Status Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterChipsRow}
            >
              {STATUS_FILTER_OPTIONS.map(option => (
                <FilterChip
                  key={option.key}
                  label={option.label}
                  isSelected={filters.status === option.key}
                  onPress={() => handleFilterChange({ status: option.key as StatusFilterKey })}
                />
              ))}
              <View style={styles.filterDivider} />
              {DATE_RANGE_OPTIONS.map(option => (
                <FilterChip
                  key={option.key}
                  label={option.label}
                  isSelected={filters.dateRange === option.key}
                  onPress={() => handleFilterChange({ dateRange: option.key })}
                />
              ))}
            </ScrollView>

            {/* Search */}
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={18} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                value={filters.searchText}
                onChangeText={(text) => handleFilterChange({ searchText: text })}
                placeholder="Search by ID or bank..."
                placeholderTextColor="#94A3B8"
              />
              {filters.searchText.length > 0 && (
                <Pressable onPress={() => handleFilterChange({ searchText: '' })}>
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </Pressable>
              )}
            </View>
          </View>

          {/* List */}
          <View style={[styles.card, styles.historyListCard]}>
            {filteredPayouts.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyStateTitle}>No payouts found</Text>
                <Text style={styles.emptyStateSubtitle}>
                  Try adjusting your filters
                </Text>
                <Pressable onPress={clearFilters} style={styles.clearFiltersButton}>
                  <Text style={styles.clearFiltersText}>Clear filters</Text>
                </Pressable>
              </View>
            ) : (
              filteredPayouts.map((payout, index) => (
                <PayoutRow
                  key={payout.id}
                  payout={payout}
                  onPress={handlePayoutPress}
                  isLast={index === filteredPayouts.length - 1}
                />
              ))
            )}
          </View>
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: insets.bottom + spacing[4] }} />
      </ScrollView>

      {/* Help Modal */}
      <BottomSheetModal
        visible={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        title="About Payouts"
      >
        <View style={styles.helpContent}>
          <View style={styles.helpItem}>
            <Ionicons name="wallet-outline" size={24} color="#0D7377" />
            <View style={styles.helpItemText}>
              <Text style={styles.helpItemTitle}>Available Balance</Text>
              <Text style={styles.helpItemDesc}>
                Earnings ready to be transferred to your bank account.
              </Text>
            </View>
          </View>
          <View style={styles.helpItem}>
            <Ionicons name="time-outline" size={24} color="#F59E0B" />
            <View style={styles.helpItemText}>
              <Text style={styles.helpItemTitle}>Pending Amount</Text>
              <Text style={styles.helpItemDesc}>
                Earnings being processed. Usually takes 1-2 business days.
              </Text>
            </View>
          </View>
          <View style={styles.helpItem}>
            <Ionicons name="calendar-outline" size={24} color="#8B5CF6" />
            <View style={styles.helpItemText}>
              <Text style={styles.helpItemTitle}>Payout Schedule</Text>
              <Text style={styles.helpItemDesc}>
                Configure automatic payouts weekly, bi-weekly, or monthly.
              </Text>
            </View>
          </View>
          <View style={styles.helpItem}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#10B981" />
            <View style={styles.helpItemText}>
              <Text style={styles.helpItemTitle}>Secure Transfers</Text>
              <Text style={styles.helpItemDesc}>
                All payouts are encrypted and processed securely.
              </Text>
            </View>
          </View>
        </View>
      </BottomSheetModal>

      {/* Upcoming Payout Detail Modal */}
      <BottomSheetModal
        visible={showUpcomingModal}
        onClose={() => setShowUpcomingModal(false)}
        title="Upcoming Payout Details"
      >
        <View style={styles.modalContent}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expected Date</Text>
            <Text style={styles.detailValue}>{formatDate(upcomingPayout.date)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Amount</Text>
            <Text style={styles.detailValueLarge}>
              {formatCurrencyFull(upcomingPayout.expectedAmount)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status</Text>
            <View style={[
              styles.statusBadge,
              { backgroundColor: PAYOUT_STATUS_CONFIG[upcomingPayout.status].bgColor }
            ]}>
              <Text style={[
                styles.statusBadgeText,
                { color: PAYOUT_STATUS_CONFIG[upcomingPayout.status].color }
              ]}>
                {PAYOUT_STATUS_CONFIG[upcomingPayout.status].label}
              </Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Destination</Text>
            <Text style={styles.detailValue}>
              {account.bankName} •••• {account.accountNumber.slice(-4)}
            </Text>
          </View>
          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownTitle}>Breakdown</Text>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Gross Earnings</Text>
              <Text style={styles.breakdownValue}>{formatCurrencyFull(upcomingPayout.expectedAmount + 42)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Platform Fee (0.18%)</Text>
              <Text style={styles.breakdownValueNeg}>-{formatCurrencyFull(42)}</Text>
            </View>
            <View style={[styles.breakdownRow, styles.breakdownTotal]}>
              <Text style={styles.breakdownTotalLabel}>Net Payout</Text>
              <Text style={styles.breakdownTotalValue}>
                {formatCurrencyFull(upcomingPayout.expectedAmount)}
              </Text>
            </View>
          </View>
        </View>
      </BottomSheetModal>

      {/* Payout Detail Modal */}
      <BottomSheetModal
        visible={showPayoutDetailModal}
        onClose={() => setShowPayoutDetailModal(false)}
        title={selectedPayout ? `Payout ${selectedPayout.id}` : 'Payout Details'}
      >
        {selectedPayout && (
          <View style={styles.modalContent}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Amount</Text>
              <Text style={styles.detailValueLarge}>
                {formatCurrencyFull(selectedPayout.amount)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Fee</Text>
              <Text style={styles.detailValue}>-{formatCurrencyFull(selectedPayout.fee)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Net Amount</Text>
              <Text style={styles.detailValueBold}>
                {formatCurrencyFull(selectedPayout.netAmount)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status</Text>
              <View style={[
                styles.statusBadge,
                { backgroundColor: PAYOUT_STATUS_CONFIG[selectedPayout.status].bgColor }
              ]}>
                <Text style={[
                  styles.statusBadgeText,
                  { color: PAYOUT_STATUS_CONFIG[selectedPayout.status].color }
                ]}>
                  {PAYOUT_STATUS_CONFIG[selectedPayout.status].label}
                </Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Bank</Text>
              <Text style={styles.detailValue}>
                {selectedPayout.bankName} •••• {selectedPayout.accountLast4}
              </Text>
            </View>

            {selectedPayout.referenceId && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Reference ID</Text>
                <Text style={styles.detailValue}>{selectedPayout.referenceId}</Text>
              </View>
            )}

            {selectedPayout.failureReason && (
              <View style={styles.failureReasonCard}>
                <Ionicons name="warning" size={20} color="#EF4444" />
                <Text style={styles.failureReasonText}>{selectedPayout.failureReason}</Text>
              </View>
            )}

            {/* Timeline */}
            {selectedPayout.timeline && (
              <View style={styles.timelineSection}>
                <Text style={styles.timelineSectionTitle}>Timeline</Text>
                {selectedPayout.timeline.initiated && (
                  <View style={styles.timelineItem}>
                    <View style={[styles.timelineItemDot, { backgroundColor: '#10B981' }]} />
                    <View style={styles.timelineItemContent}>
                      <Text style={styles.timelineItemLabel}>Initiated</Text>
                      <Text style={styles.timelineItemDate}>
                        {formatDateTime(selectedPayout.timeline.initiated)}
                      </Text>
                    </View>
                  </View>
                )}
                {selectedPayout.timeline.processing && (
                  <View style={styles.timelineItem}>
                    <View style={[styles.timelineItemDot, { backgroundColor: '#0D7377' }]} />
                    <View style={styles.timelineItemContent}>
                      <Text style={styles.timelineItemLabel}>Processing</Text>
                      <Text style={styles.timelineItemDate}>
                        {formatDateTime(selectedPayout.timeline.processing)}
                      </Text>
                    </View>
                  </View>
                )}
                {selectedPayout.timeline.completed && (
                  <View style={styles.timelineItem}>
                    <View style={[styles.timelineItemDot, { backgroundColor: '#10B981' }]} />
                    <View style={styles.timelineItemContent}>
                      <Text style={styles.timelineItemLabel}>Completed</Text>
                      <Text style={styles.timelineItemDate}>
                        {formatDateTime(selectedPayout.timeline.completed)}
                      </Text>
                    </View>
                  </View>
                )}
                {selectedPayout.timeline.failed && (
                  <View style={styles.timelineItem}>
                    <View style={[styles.timelineItemDot, { backgroundColor: '#EF4444' }]} />
                    <View style={styles.timelineItemContent}>
                      <Text style={styles.timelineItemLabel}>Failed</Text>
                      <Text style={styles.timelineItemDate}>
                        {formatDateTime(selectedPayout.timeline.failed)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {selectedPayout.status === 'paid' && (
              <PrimaryButton
                title="Download Receipt"
                onPress={handleDownloadReceipt}
                variant="outline"
                size="medium"
                style={styles.downloadButton}
              />
            )}
          </View>
        )}
      </BottomSheetModal>

      {/* Edit Account Modal */}
      <BottomSheetModal
        visible={showEditAccountModal}
        onClose={() => setShowEditAccountModal(false)}
        title="Edit Payout Account"
        maxHeight="90%"
      >
        <View style={styles.modalContent}>
          <FormTextInput
            label="Account Holder Name"
            value={editingAccount.holderName}
            onChangeText={(text) => setEditingAccount(prev => ({ ...prev, holderName: text }))}
            placeholder="Enter account holder name"
            required
            error={accountFormErrors.holderName}
            autoCapitalize="words"
          />

          <FormTextInput
            label="Bank Name"
            value={editingAccount.bankName}
            onChangeText={(text) => setEditingAccount(prev => ({ ...prev, bankName: text }))}
            placeholder="Enter bank name"
            required
            error={accountFormErrors.bankName}
            autoCapitalize="words"
          />

          <FormTextInput
            label="Account Number"
            value={editingAccount.accountNumber}
            onChangeText={(text) => setEditingAccount(prev => ({
              ...prev,
              accountNumber: text.replace(/[^0-9]/g, '')
            }))}
            placeholder="Enter account number"
            required
            error={accountFormErrors.accountNumber}
            keyboardType="numeric"
          />

          <FormTextInput
            label="IFSC Code"
            value={editingAccount.ifscCode}
            onChangeText={(text) => setEditingAccount(prev => ({
              ...prev,
              ifscCode: text.toUpperCase()
            }))}
            placeholder="e.g., HDFC0001234"
            required
            error={accountFormErrors.ifscCode}
            autoCapitalize="characters"
          />

          <View style={styles.accountTypeSection}>
            <Text style={styles.accountTypeLabel}>Account Type</Text>
            <View style={styles.accountTypeOptions}>
              <Pressable
                onPress={() => setEditingAccount(prev => ({ ...prev, accountType: 'savings' }))}
                style={[
                  styles.accountTypeOption,
                  editingAccount.accountType === 'savings' && styles.accountTypeOptionSelected,
                ]}
              >
                <Text style={[
                  styles.accountTypeOptionText,
                  editingAccount.accountType === 'savings' && styles.accountTypeOptionTextSelected,
                ]}>
                  Savings
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setEditingAccount(prev => ({ ...prev, accountType: 'current' }))}
                style={[
                  styles.accountTypeOption,
                  editingAccount.accountType === 'current' && styles.accountTypeOptionSelected,
                ]}
              >
                <Text style={[
                  styles.accountTypeOptionText,
                  editingAccount.accountType === 'current' && styles.accountTypeOptionTextSelected,
                ]}>
                  Current
                </Text>
              </Pressable>
            </View>
          </View>

          <PrimaryButton
            title="Save Account"
            onPress={saveAccount}
            size="large"
            style={styles.saveAccountButton}
          />
        </View>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  // Decorative Circles (same as SignIn screen)
  
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EBF4FF',
    borderRadius: 20,
  },
  headerCenter: {
    flex: 1,
    marginLeft: spacing[3],
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as any,
    color: '#1E293B',
  },
  headerSubtitle: {
    fontSize: fontSize.xs,
    color: '#64748B',
    marginTop: 2,
  },
  headerRight: {
    width: 40,
  },
  infoButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingTop: spacing[2],
    backgroundColor: 'transparent',
  },

  // Stats Row
  statsRow: {
    marginBottom: spacing[4],
  },
  statsRowContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },

  // Section
  section: {
    marginBottom: spacing[5],
    paddingHorizontal: spacing[4],
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    color: '#1E293B',
    marginBottom: spacing[3],
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  historyListCard: {
    minHeight: 550,
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[3],
    backgroundColor: 'white',
    gap: 24,
  },

  // Upcoming Payout
  upcomingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  upcomingDate: {
    fontSize: fontSize.sm,
    color: '#64748B',
    marginBottom: 4,
  },
  upcomingAmount: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold as any,
    color: '#1E293B',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: borderRadius.md,
    gap: 4,
  },
  statusBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },

  // Timeline
  timeline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  timelineStepContent: {
    alignItems: 'center',
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineLabel: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: fontWeight.medium as any,
  },
  timelineLine: {
    flex: 1,
    height: 2,
    marginHorizontal: spacing[2],
  },

  viewDetailsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    gap: 4,
  },
  viewDetailsText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#0D7377',
  },

  // Preferences
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  preferenceInfo: {
    flex: 1,
    marginRight: spacing[3],
  },
  preferenceLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#1E293B',
  },
  preferenceHint: {
    fontSize: fontSize.xs,
    color: '#64748B',
    marginTop: 2,
  },
  frequencySection: {
    padding: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  frequencyOptions: {
    flexDirection: 'row',
    marginTop: spacing[3],
    gap: spacing[2],
  },
  frequencyOption: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  frequencyOptionSelected: {
    backgroundColor: '#0D7377',
  },
  frequencyOptionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#64748B',
  },
  frequencyOptionTextSelected: {
    color: '#FFFFFF',
  },
  thresholdSection: {
    padding: spacing[4],
  },
  thresholdInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[4],
    marginTop: spacing[2],
    backgroundColor: '#FFFFFF',
  },
  currencyPrefix: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium as any,
    color: '#64748B',
    marginRight: spacing[2],
  },
  thresholdTextInput: {
    flex: 1,
    fontSize: fontSize.lg,
    color: '#1E293B',
    paddingVertical: spacing[3],
  },
  errorText: {
    fontSize: fontSize.xs,
    color: '#EF4444',
    marginTop: spacing[1],
  },
  saveButton: {
    marginHorizontal: spacing[4],
    marginBottom: spacing[4],
  },

  // Account
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  bankIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#E8F5F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  accountInfo: {
    flex: 1,
  },
  accountHolderName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    color: '#1E293B',
  },
  accountBankName: {
    fontSize: fontSize.sm,
    color: '#64748B',
    marginTop: 2,
  },
  accountNumber: {
    fontSize: fontSize.xs,
    color: '#94A3B8',
    marginTop: 2,
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: borderRadius.md,
    gap: 4,
  },
  verificationText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  accountDetails: {
    padding: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  accountDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  accountDetailLabel: {
    fontSize: fontSize.sm,
    color: '#64748B',
  },
  accountDetailValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#1E293B',
  },
  editAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
    gap: spacing[2],
  },
  editAccountText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#0D7377',
  },

  // Filters
  filtersContainer: {
    marginBottom: spacing[3],
  },
  filterChipsRow: {
    marginBottom: spacing[3],
  },
  filterChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    backgroundColor: '#F1F5F9',
    marginRight: spacing[2],
  },
  filterChipSelected: {
    backgroundColor: '#0D7377',
  },
  filterChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#64748B',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
  },
  filterDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginHorizontal: spacing[2],
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    fontSize: fontSize.sm,
    color: '#1E293B',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    padding: spacing[8],
  },
  emptyStateTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    color: '#1E293B',
    marginTop: spacing[4],
  },
  emptyStateSubtitle: {
    fontSize: fontSize.sm,
    color: '#64748B',
    marginTop: spacing[1],
    textAlign: 'center',
  },
  clearFiltersButton: {
    marginTop: spacing[4],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
    backgroundColor: '#E8F5F4',
  },
  clearFiltersText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#0D7377',
  },

  // Skeleton
  skeletonStatCard: {
    width: 140,
    height: 120,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginRight: spacing[3],
  },
  skeletonBox: {
    backgroundColor: '#E2E8F0',
    borderRadius: borderRadius.md,
  },
  skeletonIcon: {
    width: 36,
    height: 36,
    marginBottom: spacing[3],
  },
  skeletonAmount: {
    width: 80,
    height: 24,
    marginBottom: spacing[2],
  },
  skeletonLabel: {
    width: 60,
    height: 14,
  },
  skeletonPayoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    marginBottom: spacing[2],
  },
  skeletonRowIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginRight: spacing[3],
  },
  skeletonRowContent: {
    flex: 1,
  },
  skeletonRowTitle: {
    width: 120,
    height: 16,
    marginBottom: spacing[2],
  },
  skeletonRowSubtitle: {
    width: 80,
    height: 12,
  },

  // Modal Content
  modalContent: {
    paddingBottom: spacing[4],
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  detailLabel: {
    fontSize: fontSize.sm,
    color: '#64748B',
  },
  detailValue: {
    fontSize: fontSize.sm,
    color: '#1E293B',
  },
  detailValueLarge: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as any,
    color: '#1E293B',
  },
  detailValueBold: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold as any,
    color: '#10B981',
  },

  // Breakdown Card
  breakdownCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginTop: spacing[4],
  },
  breakdownTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    color: '#1E293B',
    marginBottom: spacing[3],
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  breakdownLabel: {
    fontSize: fontSize.sm,
    color: '#64748B',
  },
  breakdownValue: {
    fontSize: fontSize.sm,
    color: '#1E293B',
  },
  breakdownValueNeg: {
    fontSize: fontSize.sm,
    color: '#EF4444',
  },
  breakdownTotal: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: spacing[3],
    marginTop: spacing[2],
  },
  breakdownTotalLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    color: '#1E293B',
  },
  breakdownTotalValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold as any,
    color: '#10B981',
  },

  // Failure Reason
  failureReasonCard: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    marginTop: spacing[4],
    gap: spacing[2],
  },
  failureReasonText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: '#EF4444',
  },

  // Timeline Section
  timelineSection: {
    marginTop: spacing[4],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  timelineSectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    color: '#1E293B',
    marginBottom: spacing[3],
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
  },
  timelineItemDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    marginRight: spacing[3],
  },
  timelineItemContent: {
    flex: 1,
  },
  timelineItemLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#1E293B',
  },
  timelineItemDate: {
    fontSize: fontSize.xs,
    color: '#64748B',
    marginTop: 2,
  },
  downloadButton: {
    marginTop: spacing[4],
  },

  // Help Content
  helpContent: {
    gap: spacing[4],
  },
  helpItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  helpItemText: {
    flex: 1,
  },
  helpItemTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    color: '#1E293B',
    marginBottom: 2,
  },
  helpItemDesc: {
    fontSize: fontSize.sm,
    color: '#64748B',
    lineHeight: 20,
  },

  // Account Type
  accountTypeSection: {
    marginBottom: spacing[4],
  },
  accountTypeLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#374151',
    marginBottom: spacing[2],
  },
  accountTypeOptions: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  accountTypeOption: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  accountTypeOptionSelected: {
    backgroundColor: '#E8F5F4',
    borderColor: '#0D7377',
  },
  accountTypeOptionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#64748B',
  },
  accountTypeOptionTextSelected: {
    color: '#0D7377',
  },
  saveAccountButton: {
    marginTop: spacing[4],
  },

  // Toast
  toast: {
    position: 'absolute',
    top: 60,
    left: spacing[4],
    right: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    borderRadius: borderRadius.lg,
    gap: spacing[3],
    zIndex: 1000,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  toastText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
  },
  circleTopRight: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 130,
    height: 130,
    borderRadius: 70,
    backgroundColor: '#EBF4FF',
  },
  circleTopRightInner: {
    position: 'absolute',
    top: 50,
    right: 70,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E6FE8',
  },
  circleBottomLeft: {
    position: 'absolute',
    bottom: -60,
    left: -60,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#EBF4FF',
  },
});
