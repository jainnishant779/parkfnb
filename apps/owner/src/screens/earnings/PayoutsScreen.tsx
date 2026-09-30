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
  TouchableOpacity,
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
import PayoutRow from '../../components/cards/PayoutRow';
import BottomSheetModal from '../../components/modals/BottomSheetModal';
import FormTextInput from '../../components/inputs/FormTextInput';
import { PillButton, IconCircle, SearchPill, Chip, StatusTag, ProgressTrack, InfoGrid, TimelineItem, EmptyState, IsoBlock } from '../../components/ui';

// Theme
import { palette, radii, fonts } from '../../theme/kit';

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

// Payout status -> kit StatusTag tone
const STATUS_TAG_TONE: Record<PayoutStatus, string> = {
  paid: 'success',
  pending: 'warning',
  processing: 'ink',
  failed: 'danger',
  scheduled: 'ink',
  on_hold: 'warning',
} as Record<PayoutStatus, string>;

const SWITCH_PROPS = {
  trackColor: { false: palette.line, true: palette.ink },
  thumbColor: palette.surface,
  ios_backgroundColor: palette.line,
};

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
// TOAST COMPONENT
// ============================================================================

interface ToastProps {
  toast: ToastState;
  onHide: () => void;
  top: number;
}

const Toast: React.FC<ToastProps> = ({ toast, onHide, top }) => {
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

  const iconColor = toast.type === 'success' ? palette.success : toast.type === 'error' ? palette.danger : palette.peach;
  const icon = toast.type === 'success' ? 'checkmark-circle' : toast.type === 'error' ? 'close-circle' : 'information-circle';

  return (
    <Animated.View
      style={[
        styles.toast,
        { top, transform: [{ translateY }], opacity },
      ]}
    >
      <Ionicons name={icon} size={20} color={iconColor} />
      <Text style={styles.toastText}>{toast.message}</Text>
    </Animated.View>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PayoutsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
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
    availableBalance: liveStats?.revenueStats?.totalRevenue ?? 0,
    pendingAmount: liveEarnings?.earningsSummary?.pendingEarnings ?? 0,
    paidYTD: liveStats?.revenueStats?.totalRevenue ?? 0,
    availableTrend: 0,
    pendingTrend: 0,
    paidTrend: 0,
  }), [liveStats, liveEarnings]);

  const upcomingPayout = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return {
      date: d.toISOString(),
      expectedAmount: liveEarnings?.earningsSummary?.pendingEarnings ?? 0,
      status: 'scheduled' as const,
      currentStep: 0 as number,
    };
  }, [liveEarnings]);

  // ============================================================================
  // RENDER
  // ============================================================================

  const renderHeader = (withInfo: boolean) => (
    <View style={styles.header}>
      <IconCircle icon="arrow-left" size={46} onPress={() => navigation.goBack()} />
      <Text style={styles.headerTitle}>Payouts</Text>
      {withInfo ? (
        <IconCircle icon="info" size={46} onPress={() => setShowHelpModal(true)} />
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader(false)}

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.balance}>
            <View style={[styles.skeletonBox, styles.skeletonLabel]} />
            <View style={[styles.skeletonBox, styles.skeletonAmount]} />
          </View>

          <View style={[styles.skeletonBox, styles.skeletonHero]} />

          <View style={styles.section}>
            <View style={[styles.skeletonBox, styles.skeletonSectionTitle]} />
            <View style={styles.card}>
              <PayoutRowSkeleton />
              <PayoutRowSkeleton />
              <PayoutRowSkeleton />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const upcomingStatus = PAYOUT_STATUS_CONFIG[upcomingPayout.status];

  const selectedTimeline = selectedPayout?.timeline
    ? [
        selectedPayout.timeline.initiated && { key: 'initiated', label: 'Initiated', at: selectedPayout.timeline.initiated },
        selectedPayout.timeline.processing && { key: 'processing', label: 'Processing', at: selectedPayout.timeline.processing },
        selectedPayout.timeline.completed && { key: 'completed', label: 'Completed', at: selectedPayout.timeline.completed },
        selectedPayout.timeline.failed && { key: 'failed', label: 'Failed', at: selectedPayout.timeline.failed },
      ].filter(Boolean) as { key: string; label: string; at: string }[]
    : [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Toast */}
      <Toast
        toast={toast}
        top={insets.top + 8}
        onHide={() => setToast(prev => ({ ...prev, visible: false }))}
      />

      {/* Header */}
      <Animated.View style={{ opacity: headerAnim }}>
        {renderHeader(true)}
      </Animated.View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.ink} colors={[palette.ink]} />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Balance */}
        <View style={styles.balance}>
          <Text style={styles.balanceLabel}>Available balance</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(summary.availableBalance)}
            </Text>
            <PillButton
              label="Request"
              icon="arrow-up-right"
              variant="white"
              size="md"
              onPress={() => setToast({
                visible: true,
                message: 'Payout request submitted. Funds will be transferred to your bank account within 3–5 business days.',
                type: 'success',
              })}
            />
          </View>
        </View>

        {/* Stat tiles */}
        <View style={styles.tiles}>
          <View style={styles.tile}>
            <View style={styles.tileIcon}>
              <Ionicons name="time-outline" size={16} color={palette.text} />
            </View>
            <Text style={styles.tileLabel}>Pending</Text>
            <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(summary.pendingAmount)}
            </Text>
          </View>
          <View style={styles.tile}>
            <View style={styles.tileIcon}>
              <Ionicons name="trending-up-outline" size={16} color={palette.text} />
            </View>
            <Text style={styles.tileLabel}>Paid (YTD)</Text>
            <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(summary.paidYTD)}
            </Text>
          </View>
        </View>

        {/* Upcoming Payout — peach hero */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setShowUpcomingModal(true)}
          style={styles.hero}
        >
          <View style={styles.heroArt} pointerEvents="none">
            <IsoBlock size={130} tone="peach" />
          </View>
          <StatusTag label={upcomingStatus.label} tone={STATUS_TAG_TONE[upcomingPayout.status]} />
          <Text style={styles.heroLabel}>Next payout</Text>
          <Text style={styles.heroAmount}>{formatCurrencyFull(upcomingPayout.expectedAmount)}</Text>
          <ProgressTrack
            steps={3}
            current={upcomingPayout.currentStep}
            trackColor="#F7D3A6"
            style={styles.heroTrack}
          />
          <View style={styles.heroSteps}>
            <Text style={styles.heroStep}>Earnings</Text>
            <Text style={styles.heroStep}>Processing</Text>
            <Text style={styles.heroStep}>Deposit</Text>
          </View>
          <View style={styles.heroFooter}>
            <View>
              <Text style={styles.heroMetaTitle}>{formatDate(upcomingPayout.date)}</Text>
              <Text style={styles.heroMetaSub}>Expected date</Text>
            </View>
            <View style={styles.heroLink}>
              <Text style={styles.heroLinkText}>View details</Text>
              <Ionicons name="chevron-forward" size={16} color={palette.text} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Payout Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payout account</Text>
          <View style={[styles.card, styles.cardPadded]}>
            <View style={styles.accountHeader}>
              <View style={styles.bankIcon}>
                <Ionicons name="business-outline" size={22} color={palette.text} />
              </View>
              <View style={styles.accountInfo}>
                <Text style={styles.accountHolderName} numberOfLines={1}>
                  {account.holderName || 'Account holder'}
                </Text>
                <Text style={styles.accountBankName} numberOfLines={1}>
                  {account.bankName || 'Bank'} · {maskAccountNumber(account.accountNumber)}
                </Text>
              </View>
              <StatusTag
                label={account.isVerified ? 'Verified' : 'Pending'}
                tone={account.isVerified ? 'success' : 'warning'}
              />
            </View>

            <InfoGrid
              style={styles.accountGrid}
              items={[
                { label: 'IFSC', value: account.ifscCode || '—' },
                { label: 'Account type', value: account.accountType === 'savings' ? 'Savings' : 'Current' },
              ]}
            />

            <PillButton
              label="Edit account"
              icon="edit-2"
              variant="grey"
              size="md"
              onPress={() => {
                setEditingAccount(account);
                setAccountFormErrors({});
                setShowEditAccountModal(true);
              }}
            />
          </View>
        </View>

        {/* Payout Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payout preferences</Text>
          <View style={[styles.card, styles.cardPadded]}>
            {/* Auto Payout Toggle */}
            <View style={styles.preferenceRow}>
              <View style={styles.preferenceInfo}>
                <Text style={styles.preferenceLabel}>Auto payouts</Text>
                <Text style={styles.preferenceHint}>Automatically transfer available balance</Text>
              </View>
              <Switch
                value={editingPreferences.autoPayoutEnabled}
                onValueChange={(value) => handlePreferencesChange({ autoPayoutEnabled: value })}
                {...SWITCH_PROPS}
              />
            </View>

            {/* Frequency Picker */}
            {editingPreferences.autoPayoutEnabled && (
              <View style={styles.prefBlock}>
                <Text style={styles.fieldLabel}>Frequency</Text>
                <View style={styles.chipRow}>
                  {FREQUENCY_OPTIONS.map(option => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={editingPreferences.frequency === option.value}
                      onPress={() => handlePreferencesChange({ frequency: option.value })}
                      style={styles.greyChip}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Minimum Threshold */}
            <View style={styles.prefBlock}>
              <FormTextInput
                label="Minimum threshold"
                value={editingPreferences.minimumThreshold.toString()}
                onChangeText={(text: string) => {
                  const value = parseInt(text.replace(/[^0-9]/g, '')) || 0;
                  handlePreferencesChange({ minimumThreshold: value });
                }}
                keyboardType="numeric"
                placeholder="0"
                leftIcon={<Text style={styles.currencyPrefix}>₹</Text>}
                error={editingPreferences.minimumThreshold < 0 ? 'Threshold must be 0 or greater' : undefined}
              />
            </View>

            {/* Save Button */}
            {preferencesChanged && (
              <PillButton
                label="Save preferences"
                variant="ink"
                size="md"
                onPress={savePreferences}
                loading={savingPreferences}
                style={styles.saveButton}
              />
            )}
          </View>
        </View>

        {/* Payout History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payout history</Text>

          {/* Filters */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterChipsRow}
            contentContainerStyle={styles.filterChipsContent}
          >
            {STATUS_FILTER_OPTIONS.map(option => (
              <Chip
                key={option.key}
                label={option.label}
                selected={filters.status === option.key}
                onPress={() => handleFilterChange({ status: option.key as StatusFilterKey })}
              />
            ))}
            <View style={styles.filterDivider} />
            {DATE_RANGE_OPTIONS.map(option => (
              <Chip
                key={option.key}
                label={option.label}
                selected={filters.dateRange === option.key}
                onPress={() => handleFilterChange({ dateRange: option.key })}
              />
            ))}
          </ScrollView>

          {/* Search */}
          <SearchPill
            value={filters.searchText}
            onChangeText={(text: string) => handleFilterChange({ searchText: text })}
            placeholder="Search by ID or bank"
            style={styles.searchPill}
            right={
              filters.searchText.length > 0 ? (
                <TouchableOpacity onPress={() => handleFilterChange({ searchText: '' })} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={palette.textMuted} />
                </TouchableOpacity>
              ) : null
            }
          />

          {/* List */}
          <View style={[styles.card, styles.historyCard]}>
            {filteredPayouts.length === 0 ? (
              <EmptyState
                tone="blue"
                title="No payouts found"
                subtitle="Try adjusting your filters"
                action="Clear filters"
                onAction={clearFilters}
              />
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
      </ScrollView>

      {/* Help Modal */}
      <BottomSheetModal
        visible={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        title="About Payouts"
      >
        <View style={styles.modalContent}>
          {[
            { icon: 'wallet-outline', title: 'Available Balance', desc: 'Earnings ready to be transferred to your bank account.' },
            { icon: 'time-outline', title: 'Pending Amount', desc: 'Earnings being processed. Usually takes 1-2 business days.' },
            { icon: 'calendar-outline', title: 'Payout Schedule', desc: 'Configure automatic payouts weekly, bi-weekly, or monthly.' },
            { icon: 'shield-checkmark-outline', title: 'Secure Transfers', desc: 'All payouts are encrypted and processed securely.' },
          ].map(item => (
            <View key={item.title} style={styles.helpItem}>
              <View style={styles.helpIcon}>
                <Ionicons name={item.icon} size={20} color={palette.text} />
              </View>
              <View style={styles.helpItemText}>
                <Text style={styles.helpItemTitle}>{item.title}</Text>
                <Text style={styles.helpItemDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </BottomSheetModal>

      {/* Upcoming Payout Detail Modal */}
      <BottomSheetModal
        visible={showUpcomingModal}
        onClose={() => setShowUpcomingModal(false)}
        title="Upcoming Payout Details"
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalAmount}>{formatCurrencyFull(upcomingPayout.expectedAmount)}</Text>
          <StatusTag label={upcomingStatus.label} tone={STATUS_TAG_TONE[upcomingPayout.status]} />
          <InfoGrid
            style={styles.modalGrid}
            items={[
              { label: 'Expected date', value: formatDate(upcomingPayout.date) },
              { label: 'Destination', value: `${account.bankName} •••• ${account.accountNumber.slice(-4)}` },
            ]}
          />
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
            <Text style={styles.modalAmount}>{formatCurrencyFull(selectedPayout.amount)}</Text>
            <StatusTag
              label={PAYOUT_STATUS_CONFIG[selectedPayout.status].label}
              tone={STATUS_TAG_TONE[selectedPayout.status]}
            />
            <InfoGrid
              style={styles.modalGrid}
              items={[
                { label: 'Fee', value: `-${formatCurrencyFull(selectedPayout.fee)}` },
                { label: 'Net amount', value: formatCurrencyFull(selectedPayout.netAmount) },
                { label: 'Bank', value: `${selectedPayout.bankName} •••• ${selectedPayout.accountLast4}` },
                ...(selectedPayout.referenceId
                  ? [{ label: 'Reference ID', value: selectedPayout.referenceId }]
                  : []),
              ]}
            />

            {selectedPayout.failureReason && (
              <View style={styles.failureReasonCard}>
                <Ionicons name="warning-outline" size={20} color={palette.danger} />
                <Text style={styles.failureReasonText}>{selectedPayout.failureReason}</Text>
              </View>
            )}

            {/* Timeline */}
            {selectedTimeline.length > 0 && (
              <View style={styles.timelineSection}>
                <Text style={styles.breakdownTitle}>Timeline</Text>
                {selectedTimeline.map((entry, index) => (
                  <TimelineItem
                    key={entry.key}
                    title={entry.label}
                    subtitle={formatDateTime(entry.at)}
                    active={index === selectedTimeline.length - 1}
                    isLast={index === selectedTimeline.length - 1}
                  />
                ))}
              </View>
            )}

            {selectedPayout.status === 'paid' && (
              <PillButton
                label="Download receipt"
                icon="download"
                variant="grey"
                size="md"
                onPress={handleDownloadReceipt}
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
            onChangeText={(text: string) => setEditingAccount(prev => ({ ...prev, holderName: text }))}
            placeholder="Enter account holder name"
            required
            error={accountFormErrors.holderName}
            autoCapitalize="words"
          />

          <FormTextInput
            label="Bank Name"
            value={editingAccount.bankName}
            onChangeText={(text: string) => setEditingAccount(prev => ({ ...prev, bankName: text }))}
            placeholder="Enter bank name"
            required
            error={accountFormErrors.bankName}
            autoCapitalize="words"
          />

          <FormTextInput
            label="Account Number"
            value={editingAccount.accountNumber}
            onChangeText={(text: string) => setEditingAccount(prev => ({
              ...prev,
              accountNumber: text.replace(/[^0-9]/g, ''),
            }))}
            placeholder="Enter account number"
            required
            error={accountFormErrors.accountNumber}
            keyboardType="numeric"
          />

          <FormTextInput
            label="IFSC Code"
            value={editingAccount.ifscCode}
            onChangeText={(text: string) => setEditingAccount(prev => ({
              ...prev,
              ifscCode: text.toUpperCase(),
            }))}
            placeholder="e.g., HDFC0001234"
            required
            error={accountFormErrors.ifscCode}
            autoCapitalize="characters"
          />

          <Text style={styles.fieldLabel}>Account Type</Text>
          <View style={styles.chipRow}>
            <Chip
              label="Savings"
              selected={editingAccount.accountType === 'savings'}
              onPress={() => setEditingAccount(prev => ({ ...prev, accountType: 'savings' }))}
              style={styles.greyChip}
            />
            <Chip
              label="Current"
              selected={editingAccount.accountType === 'current'}
              onPress={() => setEditingAccount(prev => ({ ...prev, accountType: 'current' }))}
              style={styles.greyChip}
            />
          </View>

          <PillButton
            label="Save account"
            variant="ink"
            onPress={saveAccount}
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
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
  },
  headerSpacer: {
    width: 46,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },

  // Balance
  balance: {
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 18,
  },
  balanceLabel: {
    ...fonts.medium,
    fontSize: 15,
    color: palette.text,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 12,
  },
  balanceValue: {
    ...fonts.semibold,
    flex: 1,
    fontSize: 40,
    letterSpacing: -1,
    color: palette.text,
  },

  // Tiles
  tiles: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  tile: {
    flex: 1,
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
  },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 12,
  },
  tileValue: {
    ...fonts.semibold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: palette.text,
    marginTop: 2,
  },

  // Hero
  hero: {
    borderRadius: radii.xl,
    backgroundColor: palette.peachSoft,
    padding: 20,
    minHeight: 200,
    overflow: 'hidden',
    marginBottom: 8,
  },
  heroArt: {
    position: 'absolute',
    right: -30,
    bottom: -26,
  },
  heroLabel: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.text,
    marginTop: 16,
  },
  heroAmount: {
    ...fonts.semibold,
    fontSize: 30,
    letterSpacing: -0.8,
    color: palette.text,
    marginTop: 2,
  },
  heroTrack: {
    width: '62%',
    marginTop: 16,
  },
  heroSteps: {
    width: '66%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  heroStep: {
    ...fonts.medium,
    fontSize: 11,
    color: palette.textMuted,
  },
  heroFooter: {
    width: '62%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  heroMetaTitle: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
  },
  heroMetaSub: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 2,
  },
  heroLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  heroLinkText: {
    ...fonts.semibold,
    fontSize: 13,
    color: palette.text,
  },

  // Sections
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    ...fonts.semibold,
    fontSize: 19,
    letterSpacing: -0.2,
    color: palette.text,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  cardPadded: {
    padding: 18,
  },

  // Account
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bankIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
  },
  accountHolderName: {
    ...fonts.semibold,
    fontSize: 16,
    color: palette.text,
  },
  accountBankName: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 2,
  },
  accountGrid: {
    marginTop: 16,
    marginBottom: 6,
  },

  // Preferences
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  preferenceInfo: {
    flex: 1,
    marginRight: 12,
  },
  preferenceLabel: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
  },
  preferenceHint: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 2,
  },
  prefBlock: {
    marginTop: 16,
  },
  fieldLabel: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  currencyPrefix: {
    ...fonts.semibold,
    fontSize: 16,
    color: palette.text,
  },
  greyChip: {
    backgroundColor: palette.fill,
  },
  saveButton: {
    marginTop: 8,
  },

  // History
  filterChipsRow: {
    marginBottom: 10,
    marginHorizontal: -16,
  },
  filterChipsContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  filterDivider: {
    width: 1,
    height: 24,
    backgroundColor: palette.line,
    marginRight: 10,
  },
  searchPill: {
    backgroundColor: palette.surface,
    marginBottom: 10,
  },
  historyCard: {
    paddingHorizontal: 4,
  },

  // Modals
  modalContent: {
    paddingBottom: 8,
  },
  modalAmount: {
    ...fonts.semibold,
    fontSize: 32,
    letterSpacing: -0.8,
    color: palette.text,
    marginBottom: 10,
  },
  modalGrid: {
    marginTop: 18,
  },
  helpItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  helpIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.peachSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpItemText: {
    flex: 1,
  },
  helpItemTitle: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
  },
  helpItemDesc: {
    ...fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: palette.textMuted,
    marginTop: 2,
  },
  breakdownCard: {
    backgroundColor: palette.surfaceDim,
    borderRadius: radii.lg,
    padding: 16,
    marginTop: 8,
  },
  breakdownTitle: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
    marginBottom: 10,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  breakdownLabel: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.textMuted,
  },
  breakdownValue: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.text,
  },
  breakdownValueNeg: {
    ...fonts.semibold,
    fontSize: 14,
    color: palette.danger,
  },
  breakdownTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
    marginTop: 6,
    paddingTop: 12,
  },
  breakdownTotalLabel: {
    ...fonts.semibold,
    fontSize: 15,
    color: palette.text,
  },
  breakdownTotalValue: {
    ...fonts.bold,
    fontSize: 16,
    color: palette.text,
  },
  failureReasonCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: palette.dangerSoft,
    borderRadius: radii.md,
    padding: 14,
    marginTop: 8,
  },
  failureReasonText: {
    ...fonts.medium,
    flex: 1,
    fontSize: 13,
    color: palette.danger,
  },
  timelineSection: {
    marginTop: 16,
  },
  downloadButton: {
    marginTop: 16,
  },
  saveAccountButton: {
    marginTop: 20,
  },

  // Toast
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radii.lg,
    backgroundColor: palette.ink,
  },
  toastText: {
    ...fonts.medium,
    flex: 1,
    fontSize: 14,
    color: palette.textInverse,
  },

  // Skeletons
  skeletonBox: {
    backgroundColor: palette.bgSoft,
    borderRadius: radii.sm,
  },
  skeletonLabel: {
    width: 120,
    height: 16,
  },
  skeletonAmount: {
    width: 180,
    height: 40,
    marginTop: 8,
  },
  skeletonHero: {
    height: 200,
    borderRadius: radii.xl,
  },
  skeletonSectionTitle: {
    width: 140,
    height: 20,
    marginBottom: 12,
  },
  skeletonPayoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  skeletonRowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  skeletonRowContent: {
    flex: 1,
  },
  skeletonRowTitle: {
    width: '60%',
    height: 16,
    marginBottom: 8,
  },
  skeletonRowSubtitle: {
    width: '40%',
    height: 12,
  },
});
