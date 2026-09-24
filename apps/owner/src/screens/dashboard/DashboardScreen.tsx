import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Switch,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Theme & UI kit
import { palette, radii, fonts } from '../../theme/kit';
import {
  PillButton,
  IconCircle,
  SectionTitle,
  Avatar,
  StatusTag,
  ListRow,
  Segmented,
  IsoBlock,
} from '../../components/ui';

// Utils
import { resolveImageUri } from '../../utils/imageUri';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatOwnerGreeting,
  formatPercentage,
  formatTimeRange,
} from '../../utils/formatters';
import {
  loadAllDashboardData,
  dismissAlert,
  saveLastBookingsTab,
  DashboardData,
} from '../../utils/storage';
import {
  loadTemplates,
} from '../../services/complianceStorage';
import type { ComplianceTemplate } from '../../types/compliance';
import { ROUTES } from '../../constants/routes';
import { ENABLE_TYPE_SPECIFIC_UI } from '../../constants/featureFlags';
import { useAuth } from '../../context/AuthContext';
import { bookingService } from '../../services/bookingService';
import { listingService } from '../../services/listingService';
import earningsService, { startOfWeek, startOfToday } from '../../services/earningsService';
import type { ApiBooking, ApiProperty, ApiOwnerStats } from '../../types/api';
import type { DashboardBooking, DashboardListing } from '../../constants/mockData';

// Owner type constants
const INDUSTRIAL_OWNER_TYPES = ['industrial_facility'];
const PROPERTIES_STORAGE_KEY = '@ownerapp/properties_v1';

// Types
type BookingsTab = 'requests' | 'active' | 'upcoming';

interface DashboardProperty {
  id: string;
  name: string;
  addressLine?: string;
  city?: string;
  totalSlots: number;
  availableSlots: number;
}

interface Alert {
  id: string;
  type: 'kyc' | 'bank' | 'bookings' | 'listing';
  title: string;
  description: string;
  actionLabel: string;
  route: string;
}

// Transform helpers
function transformApiBookingToDashboard(b: ApiBooking): DashboardBooking {
  const space = b.spaceId;
  const user = b.userId;
  const vehicle = b.vehicleId;

  const propertyName = space?.propertyId?.propertyName ?? 'Unknown Property';
  const spaceNumber = space?.spaceNumber ?? '—';

  const renterName = user
    ? (user.legalName ||
       `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
       (user.phone ? `+91 ${user.phone}` : 'Unknown Renter'))
    : 'Unknown Renter';
  const renterInitials = renterName
    .replace(/[^A-Za-z ]/g, '')
    .split(' ')
    .map((n: string) => n[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || '#';

  const statusMap: Record<ApiBooking['status'], DashboardBooking['status']> = {
    pending:   'request',
    confirmed: 'upcoming',
    active:    'active',
    completed: 'completed',
    cancelled: 'cancelled',
    rejected:  'rejected',
    no_show:   'cancelled',
  };

  return {
    id: b.id,
    listingId: space?.id ?? '',
    listingTitle: `${propertyName} · ${spaceNumber}`,
    renterName,
    renterInitials,
    start: b.startTime,
    end:   b.endTime,
    status: statusMap[b.status] ?? 'upcoming',
    amount: b.totalAmount,
    vehiclePlate: vehicle?.licensePlate,
  };
}

function transformApiPropertyToListing(p: ApiProperty): DashboardListing {
  return {
    id:           p.id,
    title:        p.propertyName,
    location:     `${p.city}${p.state ? ', ' + p.state : ''}`,
    capacity:     p.totalSpaces ?? 1,
    isLive:       p.isActive,
    photoUri:     resolveImageUri(p.propertyImages?.[0]),
    pricePerHour: 0, // price lives on spaces, not property
  };
}

// Main Dashboard Screen
export default function DashboardScreen() {
  const navigation = useNavigation();
  const { kycStatus, user, owner } = useAuth();
  const insets = useSafeAreaInsets();

  // Persistent UI state (alerts dismissals, tab selection)
  const [data, setData] = useState<DashboardData | null>(null);
  const [bookingsTab, setBookingsTab] = useState<BookingsTab>('requests');
  const [localDismissedAlerts, setLocalDismissedAlerts] = useState<string[]>([]);

  // Owner type flags
  const [isIndustrialOwner, setIsIndustrialOwner] = useState(false);
  const [isEmptyLandOwner, setIsEmptyLandOwner] = useState(false);
  const [isResidentialOwner, setIsResidentialOwner] = useState(false);
  const [complianceTemplates, setComplianceTemplates] = useState<ComplianceTemplate[]>([]);
  const [properties, setProperties] = useState<DashboardProperty[]>([]);

  // Scroll / refresh
  const [refreshing, setRefreshing] = useState(false);

  // Live API state
  const [liveStats, setLiveStats] = useState<ApiOwnerStats | null>(null);
  const [liveTodayEarnings, setLiveTodayEarnings] = useState(0);
  const [liveWeekEarnings, setLiveWeekEarnings] = useState(0);
  const [liveRequestBookings, setLiveRequestBookings] = useState<DashboardBooking[]>([]);
  const [liveActiveBookings, setLiveActiveBookings] = useState<DashboardBooking[]>([]);
  const [liveUpcomingBookings, setLiveUpcomingBookings] = useState<DashboardBooking[]>([]);
  const [liveListings, setLiveListings] = useState<DashboardListing[]>([]);
  const [liveRequestCount, setLiveRequestCount] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load persistent UI state (dismissed alerts, last bookings tab)
      const dashboardData = await loadAllDashboardData();
      setData(dashboardData);
      setBookingsTab(dashboardData.dashboardState.lastSelectedBookingsTab);
      setLocalDismissedAlerts(dashboardData.dashboardState.dismissedAlerts);

      // Owner type flags. ENABLE_TYPE_SPECIFIC_UI gates the per-owner-type
      // dashboard sections (compliance templates, residential properties,
      // empty-land IoT) so the default Listings/Earnings dashboard renders
      // for everyone until the specialty UI is re-enabled. Source is the
      // AuthContext owner record (backend-authoritative); the legacy
      // AsyncStorage 'ownerType' key is no longer maintained.
      const ownerType = ENABLE_TYPE_SPECIFIC_UI ? owner?.ownerType ?? null : null;
      const isIndustrial = ENABLE_TYPE_SPECIFIC_UI && ownerType ? INDUSTRIAL_OWNER_TYPES.includes(ownerType) : false;
      const isEmptyLand  = ENABLE_TYPE_SPECIFIC_UI && ownerType === 'empty_land';
      const isResidential = ENABLE_TYPE_SPECIFIC_UI && ownerType === 'residential_community';
      setIsIndustrialOwner(isIndustrial);
      setIsEmptyLandOwner(isEmptyLand);
      setIsResidentialOwner(isResidential);

      if (isIndustrial) {
        const templates = await loadTemplates();
        setComplianceTemplates(templates);
      }

      if (isResidential) {
        const propsData = await AsyncStorage.getItem(PROPERTIES_STORAGE_KEY);
        if (propsData) {
          const rawProps = JSON.parse(propsData);
          const dashboardProps: DashboardProperty[] = rawProps.map((prop: any) => {
            const totalSlots = prop.zones?.reduce(
              (acc: number, zone: any) => acc + (zone.slots?.length || 0), 0,
            ) || 0;
            const availableSlots = prop.zones?.reduce(
              (acc: number, zone: any) =>
                acc + (zone.slots?.filter((s: any) => s.status === 'available').length || 0),
              0,
            ) || 0;
            return {
              id:          prop.id,
              name:        prop.name,
              addressLine: prop.addressLine,
              city:        prop.city,
              totalSlots,
              availableSlots,
            };
          });
          setProperties(dashboardProps);
        }
      }
    } catch (error) {
      console.error('Failed to load dashboard persistent state:', error);
    }

    // Fetch live data from backend in parallel
    await fetchLiveData();
  };

  /** Fetch all live dashboard data from the backend. Each call fails independently. */
  const fetchLiveData = useCallback(async () => {
    if (!owner?.id) return;

    const now     = new Date();
    const todayStart = startOfToday();
    const todayEnd   = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekStart  = startOfWeek();

    const [
      statsRes,
      todayEarningsRes,
      weekEarningsRes,
      requestsRes,
      activeRes,
      upcomingRes,
      listingsRes,
    ] = await Promise.allSettled([
      earningsService.getOwnerStats(owner.id),
      earningsService.getOwnerEarnings(owner.id, todayStart, todayEnd),
      earningsService.getOwnerEarnings(owner.id, weekStart, now),
      bookingService.getOwnerBookings(owner.id, { status: 'pending',   limit: 10 }),
      bookingService.getOwnerBookings(owner.id, { status: 'active',    limit: 10 }),
      bookingService.getOwnerBookings(owner.id, { status: 'confirmed', limit: 10 }),
      listingService.listMyProperties(owner.id, 1, 10),
    ]);

    if (statsRes.status === 'fulfilled') {
      setLiveStats(statsRes.value);
    }
    if (todayEarningsRes.status === 'fulfilled') {
      setLiveTodayEarnings(
        todayEarningsRes.value.earningsSummary?.totalEarnings ?? 0,
      );
    }
    if (weekEarningsRes.status === 'fulfilled') {
      setLiveWeekEarnings(
        weekEarningsRes.value.earningsSummary?.totalEarnings ?? 0,
      );
    }
    if (requestsRes.status === 'fulfilled') {
      const bookings = requestsRes.value?.bookings ?? [];
      setLiveRequestBookings(bookings.map(transformApiBookingToDashboard));
      setLiveRequestCount(requestsRes.value?.total ?? bookings.length);
    }
    if (activeRes.status === 'fulfilled') {
      setLiveActiveBookings(
        (activeRes.value?.bookings ?? []).map(transformApiBookingToDashboard),
      );
    }
    if (upcomingRes.status === 'fulfilled') {
      setLiveUpcomingBookings(
        (upcomingRes.value?.bookings ?? []).map(transformApiBookingToDashboard),
      );
    }
    if (listingsRes.status === 'fulfilled') {
      // A settled promise still says nothing about the payload's shape, and
      // one missing array here blanks the whole dashboard.
      setLiveListings(
        (listingsRes.value?.properties ?? []).map(transformApiPropertyToListing),
      );
    }
  }, [owner?.id]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [owner?.id]);

  // Navigation handlers
  const handleNotifications = useCallback(() => {
    navigation.navigate(ROUTES.NOTIFICATIONS as never);
  }, [navigation]);

  const handleViewAllBookings = useCallback(() => {
    navigation.navigate(ROUTES.TABS.BOOKINGS as never);
  }, [navigation]);

  const handleViewBookingRequests = useCallback(() => {
    navigation.navigate('BookingRequestQueue' as never);
  }, [navigation]);

  const handleViewAllListings = useCallback(() => {
    navigation.navigate(ROUTES.TABS.LISTINGS as never);
  }, [navigation]);

  const handleViewCompliance = useCallback(() => {
    navigation.navigate(ROUTES.TABS.COMPLIANCE as never);
  }, [navigation]);

  const handleAddListing = useCallback(() => {
    navigation.navigate(ROUTES.ADD_LISTING as never);
  }, [navigation]);

  const handleAddProperty = useCallback(() => {
    (navigation as any).navigate(ROUTES.TABS.PROPERTIES);
  }, [navigation]);

  const handleSetAvailability = useCallback(() => {
    navigation.navigate(ROUTES.AVAILABILITY as never);
  }, [navigation]);

  const handleCreatePromo = useCallback(() => {
    navigation.navigate(ROUTES.PROMOTIONS as never);
  }, [navigation]);

  const handleViewPayouts = useCallback(() => {
    navigation.navigate(ROUTES.PAYOUTS as never);
  }, [navigation]);

  const handleNavigateToKyc = useCallback(() => {
    navigation.navigate(ROUTES.KYC as never);
  }, [navigation]);

  const handleNavigateToBankSetup = useCallback(() => {
    (navigation as any).navigate(ROUTES.KYC, { section: 'bank' });
  }, [navigation]);

  // "Complete your first listing" alert handler. Picks the first
  // property that still has zero spaces (typically the auto-seeded
  // draft from KYC submit) and opens the PropertyWizard against it
  // so the user can edit address/photos/etc., chained into the
  // space wizard for the first space + publish flow. If no property
  // exists at all (auto-create failed), opens a fresh wizard.
  const handleCompleteFirstListing = useCallback(() => {
    const incomplete = liveListings.find((l) => (l.capacity ?? 0) === 0);
    if (incomplete) {
      (navigation as any).navigate('PropertyWizard', {
        editPropertyId: incomplete.id,
        chainToSpace: true,
      });
    } else {
      (navigation as any).navigate('PropertyWizard', { chainToSpace: true });
    }
  }, [navigation, liveListings]);

  const handleBookingsTabChange = useCallback(async (tab: BookingsTab) => {
    setBookingsTab(tab);
    await saveLastBookingsTab(tab);
  }, []);

  // Optimistic local toggle for listing live status
  const handleListingToggle = useCallback((listingId: string) => {
    setLiveListings(prev =>
      prev.map(l => l.id === listingId ? { ...l, isLive: !l.isLive } : l),
    );
  }, []);

  const handleDismissAlert = useCallback(async (alertId: string) => {
    setLocalDismissedAlerts(prev => [...prev, alertId]);
    await dismissAlert(alertId);
  }, []);

  // Computed KPI and derived values from live API data
  const computedData = useMemo(() => {
    const activeBookingsCount = liveStats?.bookingStats?.activeBookings ?? 0;
    const occupancyRate       = Math.round(liveStats?.bookingStats?.occupancyRate ?? 0);
    const avgRating           = liveStats?.performance?.averageRating ?? 0;
    const monthEarnings       = liveStats?.revenueStats?.monthlyRevenue ?? 0;

    return {
      todayEarnings:      liveTodayEarnings,
      monthEarnings,
      weekEarnings:       liveWeekEarnings,
      activeBookingsCount,
      occupancyRate,
      requestBookings:    liveRequestBookings,
      activeBookings:     liveActiveBookings,
      upcomingBookings:   liveUpcomingBookings,
      unreadCount:        0, // fetched separately by notifications screen
      liveListings:       liveListings.filter(l => l.isLive).length,
      pausedListings:     liveListings.filter(l => !l.isLive).length,
      totalListings:      liveListings.length,
      avgRating,
      requestsCount:      liveRequestCount,
    };
  }, [
    liveStats,
    liveTodayEarnings,
    liveWeekEarnings,
    liveRequestBookings,
    liveActiveBookings,
    liveUpcomingBookings,
    liveListings,
    liveRequestCount,
  ]);

  // Build alerts from real KYC status + live booking requests
  const alerts = useMemo((): Alert[] => {
    const alertsList: Alert[] = [];

    if (kycStatus === 'not_started' || kycStatus === 'draft') {
      alertsList.push({
        id: 'kyc_pending',
        type: 'kyc',
        title: 'KYC pending',
        description: 'Complete verification to publish listings',
        actionLabel: 'Complete',
        route: ROUTES.KYC,
      });
    } else if (kycStatus === 'submitted') {
      alertsList.push({
        id: 'kyc_pending',
        type: 'kyc',
        title: 'KYC under review',
        description: 'Your documents are being verified',
        actionLabel: 'View',
        route: ROUTES.KYC,
      });
    } else if (kycStatus === 'rejected') {
      alertsList.push({
        id: 'kyc_pending',
        type: 'kyc',
        title: 'KYC rejected',
        description: 'Please fix the issues and resubmit your documents',
        actionLabel: 'Fix now',
        route: ROUTES.KYC,
      });
    }

    if (kycStatus === 'not_started') {
      alertsList.push({
        id: 'bank_incomplete',
        type: 'bank',
        title: 'Bank details incomplete',
        description: 'Add payout method to receive earnings',
        actionLabel: 'Add',
        route: ROUTES.ONBOARDING.BANK_SETUP,
      });
    }

    // Once KYC is done, the user has a draft property auto-seeded from
    // their address but no spaces yet. `liveListings` is the list of
    // *properties* (not spaces), with `capacity` set to total_spaces
    // from the backend. We treat the user as "incomplete" when no
    // property has any spaces — covers the auto-seeded draft, an empty
    // user-created property, or no properties at all (vacuous truth).
    const hasNoSpacesAnywhere =
      liveListings.length === 0 || liveListings.every(l => (l.capacity ?? 0) === 0);
    if (kycStatus === 'verified' && hasNoSpacesAnywhere) {
      alertsList.push({
        id: 'first_listing',
        type: 'listing',
        title: 'Complete your first listing',
        description: liveListings.length === 0
          ? 'Add a property and a parking space to start accepting bookings'
          : 'Add a parking space to your draft property to start accepting bookings',
        actionLabel: 'Add',
        route: ROUTES.TABS.LISTINGS,
      });
    }

    if (liveRequestCount > 0) {
      alertsList.push({
        id: 'booking_requests',
        type: 'bookings',
        title: `${liveRequestCount} booking request${liveRequestCount > 1 ? 's' : ''}`,
        description: 'Awaiting your approval',
        actionLabel: 'Review',
        route: ROUTES.TABS.BOOKINGS,
      });
    }

    return alertsList.filter(a => !localDismissedAlerts.includes(a.id));
  }, [localDismissedAlerts, kycStatus, liveRequestCount, liveListings]);

  // First name for greeting
  const firstName = useMemo(() => {
    if (user?.firstName) return user.firstName;
    if (user?.legalName) return user.legalName.split(' ')[0];
    if (data) return data.ownerProfile.name.split(' ')[0];
    return 'Owner';
  }, [user, data]);

  // KYC status tag shown under the owner's name
  const kycTag = useMemo((): { label: string; tone: 'success' | 'warning' | 'danger' } | null => {
    if (kycStatus === 'verified')  return { label: 'Verified', tone: 'success' };
    if (kycStatus === 'submitted') return { label: 'KYC in review', tone: 'warning' };
    if (kycStatus === 'rejected')  return { label: 'KYC rejected', tone: 'danger' };
    return null;
  }, [kycStatus]);

  // Full name for the profile row
  const displayName = useMemo(() => {
    if (user?.legalName) return user.legalName;
    const full = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
    return full || firstName;
  }, [user, firstName]);

  // Bookings for the currently selected tab (max 3 on dashboard)
  const currentBookings = useMemo(() => {
    switch (bookingsTab) {
      case 'requests': return computedData.requestBookings.slice(0, 3);
      case 'active':   return computedData.activeBookings.slice(0, 3);
      case 'upcoming': return computedData.upcomingBookings.slice(0, 3);
      default:         return [];
    }
  }, [bookingsTab, computedData]);

  // KPI tiles. Every figure is live: listings and pending requests come
  // from the bookings/listings fetches, active bookings, occupancy and
  // revenue from GET /owners/:id/stats. Currency is compacted because a tile
  // is half the panel width.
  const kpiTiles = useMemo(() => [
    {
      key: 'today',
      icon: 'cash-outline',
      value: formatCurrencyCompact(computedData.todayEarnings),
      label: "Today's earnings",
      onPress: () => navigation.navigate(ROUTES.TABS.EARNINGS as never),
    },
    {
      key: 'week',
      icon: 'trending-up-outline',
      value: formatCurrencyCompact(computedData.weekEarnings),
      label: 'This week',
      onPress: () => navigation.navigate(ROUTES.TABS.EARNINGS as never),
    },
    {
      key: 'occupancy',
      icon: 'stats-chart-outline',
      value: formatPercentage(computedData.occupancyRate),
      label: 'Occupancy',
      onPress: handleViewAllListings,
    },
    {
      key: 'listings',
      icon: 'business-outline',
      value: computedData.totalListings.toString(),
      label: 'Listings',
      onPress: handleViewAllListings,
    },
  ], [computedData, handleViewAllListings, navigation]);

  const bookingsSegmentOptions = useMemo(() => [
    {
      id: 'requests' as BookingsTab,
      label: computedData.requestsCount > 0 ? `Requests (${computedData.requestsCount})` : 'Requests',
    },
    { id: 'active'   as BookingsTab, label: 'Active' },
    { id: 'upcoming' as BookingsTab, label: 'Upcoming' },
  ], [computedData]);

  const alertIcon: Record<Alert['type'], string> = {
    kyc: 'shield',
    bank: 'credit-card',
    bookings: 'inbox',
    listing: 'plus-square',
  };

  const runAlertAction = (alert: Alert) => {
    if (alert.type === 'kyc') handleNavigateToKyc();
    else if (alert.type === 'bank') handleNavigateToBankSetup();
    else if (alert.type === 'listing') handleCompleteFirstListing();
    else handleViewBookingRequests();
  };

  const bookingTagTone = (status: DashboardBooking['status']) => {
    if (status === 'active') return 'success';
    if (status === 'request') return 'warning';
    if (status === 'cancelled' || status === 'rejected') return 'danger';
    if (status === 'completed') return 'grey';
    return 'ink';
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: insets.top + 8 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={palette.ink}
          />
        }
        showsVerticalScrollIndicator={false}
        testID="dashboard-header"
      >
        {/* Profile row */}
        <View style={styles.topRow}>
          <Avatar name={displayName} size={58} />
          <View style={styles.topText}>
            <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
            <View style={styles.subRow}>
              <Text style={styles.subText} numberOfLines={1}>
                {formatOwnerGreeting(firstName)}
              </Text>
              {kycTag ? (
                <StatusTag label={kycTag.label} tone={kycTag.tone} style={styles.kycTag} />
              ) : null}
            </View>
          </View>
          <IconCircle
            icon="bell"
            size={50}
            badge={computedData.unreadCount > 0}
            onPress={handleNotifications}
          />
        </View>

        {/* Balance */}
        <View style={styles.balanceRow}>
          <TouchableOpacity
            style={styles.flex}
            activeOpacity={0.7}
            onPress={() => navigation.navigate(ROUTES.TABS.EARNINGS as never)}
          >
            <Text style={styles.balanceLabel}>Earnings this month</Text>
            <Text style={styles.balanceValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(computedData.monthEarnings)}
            </Text>
          </TouchableOpacity>
          <PillButton
            label="Payouts"
            icon="arrow-up-right"
            size="md"
            onPress={handleViewPayouts}
          />
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <PillButton
            label={isResidentialOwner ? 'Add property' : 'Add listing'}
            icon="plus"
            onPress={isResidentialOwner ? handleAddProperty : handleAddListing}
            style={styles.flex}
          />
          <PillButton
            label="Availability"
            icon="calendar"
            onPress={handleSetAvailability}
            style={styles.flex}
          />
        </View>

        {/* Content panel */}
        <View style={[styles.panel, { paddingBottom: insets.bottom + 120 }]}>
          {/* KPI tiles */}
          <View style={styles.kpiGrid}>
            {kpiTiles.map((tile) => (
              <TouchableOpacity
                key={tile.key}
                activeOpacity={0.8}
                onPress={tile.onPress}
                style={styles.kpiTile}
              >
                <View style={styles.kpiIcon}>
                  <Ionicons name={tile.icon} size={17} color={palette.text} />
                </View>
                <Text style={styles.kpiValue} numberOfLines={1}>{tile.value}</Text>
                <Text style={styles.kpiLabel} numberOfLines={1}>{tile.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Feature cards */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleViewBookingRequests}
            style={[styles.featureCard, { backgroundColor: palette.peachSoft }]}
          >
            <View style={styles.featureArt} pointerEvents="none">
              <IsoBlock size={140} tone="peach" />
            </View>
            <StatusTag
              label={computedData.requestsCount > 0 ? `${computedData.requestsCount} pending` : 'All clear'}
              tone="ink"
            />
            <View style={styles.featureBody}>
              <Text style={styles.featureTitle}>Booking requests</Text>
              <View style={styles.featureMetaRow}>
                <View>
                  <Text style={styles.featureMetaTitle}>{computedData.requestsCount}</Text>
                  <Text style={styles.featureMetaSub}>Awaiting approval</Text>
                </View>
                <View>
                  <Text style={styles.featureMetaTitle}>{computedData.upcomingBookings.length}</Text>
                  <Text style={styles.featureMetaSub}>Upcoming</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleViewAllBookings}
            style={[styles.featureCard, { backgroundColor: palette.blueSoft }]}
          >
            <View style={styles.featureArt} pointerEvents="none">
              <IsoBlock size={140} tone="blue" />
            </View>
            <StatusTag label={`${computedData.activeBookingsCount} live`} tone="ink" />
            <View style={styles.featureBody}>
              <Text style={styles.featureTitle}>Active bookings</Text>
              <View style={styles.featureMetaRow}>
                <View>
                  <Text style={styles.featureMetaTitle}>
                    {formatPercentage(computedData.occupancyRate)}
                  </Text>
                  <Text style={styles.featureMetaSub}>Occupancy</Text>
                </View>
                <View>
                  <Text style={styles.featureMetaTitle}>
                    {computedData.liveListings}/{computedData.totalListings}
                  </Text>
                  <Text style={styles.featureMetaSub}>Listings live</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>

          {/* Alerts */}
          {alerts.length > 0 && (
            <>
              <SectionTitle title="Needs attention" style={styles.sectionGap} />
              <View style={styles.greyCard}>
                {alerts.map((alert, index) => (
                  <ListRow
                    key={alert.id}
                    icon={alertIcon[alert.type]}
                    title={alert.title}
                    subtitle={alert.description}
                    onPress={() => runAlertAction(alert)}
                    isLast={index === alerts.length - 1}
                    right={
                      <View style={styles.alertRight}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => runAlertAction(alert)}
                          style={styles.alertAction}
                        >
                          <Text style={styles.alertActionText}>{alert.actionLabel}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          hitSlop={10}
                          onPress={() => handleDismissAlert(alert.id)}
                          style={styles.alertDismiss}
                        >
                          <Ionicons name="close" size={16} color={palette.textMuted} />
                        </TouchableOpacity>
                      </View>
                    }
                  />
                ))}
              </View>
            </>
          )}

          {/* Bookings */}
          <SectionTitle
            title="Bookings"
            action="View all"
            onAction={handleViewAllBookings}
            style={styles.sectionGap}
          />
          <Segmented
            options={bookingsSegmentOptions}
            value={bookingsTab}
            onChange={handleBookingsTabChange}
          />
          <View style={styles.bookingsList}>
            {currentBookings.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="calendar-outline" size={22} color={palette.textMuted} />
                <Text style={styles.emptyTitle}>{`No ${bookingsTab} bookings`}</Text>
                <Text style={styles.emptySub}>
                  {bookingsTab === 'requests'
                    ? 'New booking requests will appear here'
                    : `Your ${bookingsTab} bookings will show up here`}
                </Text>
              </View>
            ) : (
              currentBookings.map((booking, index) => (
                <TouchableOpacity
                  key={booking.id}
                  activeOpacity={0.7}
                  style={[
                    styles.bookingRow,
                    index !== currentBookings.length - 1 && styles.rowDivider,
                  ]}
                  onPress={() =>
                    (navigation as any).navigate(ROUTES.BOOKING_DETAILS, {
                      bookingId: booking.id,
                    })
                  }
                >
                  <Avatar name={booking.renterName} size={46} ring={false} />
                  <View style={styles.bookingText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{booking.renterName}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>{booking.listingTitle}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {formatTimeRange(booking.start, booking.end)}
                      {booking.vehiclePlate ? `  ·  ${booking.vehiclePlate}` : ''}
                    </Text>
                  </View>
                  <View style={styles.bookingRight}>
                    <Text style={styles.bookingAmount}>{formatCurrency(booking.amount)}</Text>
                    <StatusTag
                      label={booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                      tone={bookingTagTone(booking.status)}
                      style={styles.bookingTag}
                    />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Listings / IOT Setup / Compliance Templates / Properties */}
          {isIndustrialOwner ? (
            <>
              <SectionTitle
                title="Compliance templates"
                action="View all"
                onAction={handleViewCompliance}
                style={styles.sectionGap}
              />
              {complianceTemplates.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="document-text-outline" size={22} color={palette.textMuted} />
                  <Text style={styles.emptyTitle}>No templates yet</Text>
                  <Text style={styles.emptySub}>
                    Create compliance templates to manage document requirements
                  </Text>
                </View>
              ) : (
                <View style={styles.greyCard}>
                  {complianceTemplates.slice(0, 3).map((template, index) => (
                    <ListRow
                      key={template.id}
                      icon="file-text"
                      title={template.name}
                      subtitle={`${template.requiredTypes.length} required documents`}
                      onPress={handleViewCompliance}
                      isLast={index === Math.min(complianceTemplates.length - 1, 2)}
                    />
                  ))}
                </View>
              )}
            </>
          ) : isEmptyLandOwner ? (
            <>
              <SectionTitle
                title="IOT setup"
                action="Configure"
                onAction={() => (navigation as any).navigate('IoTIntegrations')}
                style={styles.sectionGap}
              />
              <View style={[styles.featureCard, { backgroundColor: palette.peachSoft }]}>
                <View style={styles.featureArt} pointerEvents="none">
                  <IsoBlock size={140} tone="peach" />
                </View>
                <View style={styles.featureBody}>
                  <Text style={styles.featureTitle}>Connect your devices</Text>
                  <Text style={styles.featureDesc}>
                    Set up sensors, cameras, and access controls for your parking lot
                  </Text>
                  <PillButton
                    label="Start setup"
                    icon="settings"
                    variant="ink"
                    size="sm"
                    onPress={() => (navigation as any).navigate('IoTIntegrations')}
                    style={styles.featureBtn}
                  />
                </View>
              </View>
            </>
          ) : isResidentialOwner ? (
            <>
              <SectionTitle
                title="Properties"
                action="Manage"
                onAction={() => (navigation as any).navigate(ROUTES.TABS.PROPERTIES)}
                style={styles.sectionGap}
              />
              {properties.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="home-outline" size={22} color={palette.textMuted} />
                  <Text style={styles.emptyTitle}>No properties yet</Text>
                  <Text style={styles.emptySub}>Add your first property to manage parking slots</Text>
                </View>
              ) : (
                <View style={styles.greyCard}>
                  {properties.slice(0, 3).map((property, index) => (
                    <ListRow
                      key={property.id}
                      icon="home"
                      title={property.name}
                      subtitle={property.addressLine || property.city || 'No address'}
                      onPress={() => (navigation as any).navigate(ROUTES.TABS.PROPERTIES)}
                      isLast={index === Math.min(properties.length - 1, 2)}
                      right={
                        <View style={styles.slotStats}>
                          <Text style={styles.slotValue}>
                            {property.availableSlots}/{property.totalSlots}
                          </Text>
                          <Text style={styles.rowSub}>available</Text>
                        </View>
                      }
                    />
                  ))}
                </View>
              )}
            </>
          ) : (
            /* Individual / Commercial / Empty Land listings from real API */
            <>
              <SectionTitle
                title="Listings"
                action="View all"
                onAction={handleViewAllListings}
                style={styles.sectionGap}
              />
              {liveListings.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="business-outline" size={22} color={palette.textMuted} />
                  <Text style={styles.emptyTitle}>No listings yet</Text>
                  <Text style={styles.emptySub}>Add your first parking spot to start earning</Text>
                </View>
              ) : (
                liveListings.slice(0, 3).map((listing) => (
                  <TouchableOpacity
                    key={listing.id}
                    activeOpacity={0.8}
                    style={styles.listingRow}
                    onPress={() =>
                      (navigation as any).navigate(ROUTES.LISTING_DETAILS, {
                        listingId: listing.id,
                      })
                    }
                  >
                    {listing.photoUri ? (
                      <Image source={{ uri: listing.photoUri }} style={styles.listingThumb} />
                    ) : (
                      <View style={[styles.listingThumb, styles.listingThumbEmpty]}>
                        <IsoBlock size={52} tone="peach" />
                      </View>
                    )}
                    <View style={styles.bookingText}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{listing.title}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>{listing.location}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {listing.capacity} space{listing.capacity === 1 ? '' : 's'}
                        {'  ·  '}
                        {listing.isLive ? 'Live' : 'Paused'}
                      </Text>
                    </View>
                    <Switch
                      value={listing.isLive}
                      onValueChange={() => handleListingToggle(listing.id)}
                      trackColor={{ false: palette.bgSoft, true: palette.ink }}
                      thumbColor={palette.surface}
                      ios_backgroundColor={palette.bgSoft}
                    />
                  </TouchableOpacity>
                ))
              )}
            </>
          )}

          {/* Shortcuts */}
          <SectionTitle title="Shortcuts" style={styles.sectionGap} />
          <View style={styles.greyCard}>
            <ListRow
              icon="tag"
              title="Create promo"
              subtitle="Offer a discount to fill empty slots"
              onPress={handleCreatePromo}
            />
            <ListRow
              icon="credit-card"
              title="View payouts"
              subtitle="Transfers to your bank account"
              onPress={handleViewPayouts}
              isLast
            />
          </View>

          {/* Recent Reviews — hidden for industrial owners */}
          {!isIndustrialOwner && (
            <>
              <SectionTitle title="Recent reviews" style={styles.sectionGap} />
              {computedData.avgRating === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="star-outline" size={22} color={palette.textMuted} />
                  <Text style={styles.emptyTitle}>No reviews yet</Text>
                  <Text style={styles.emptySub}>Reviews from renters will appear here</Text>
                </View>
              ) : (
                <View style={[styles.greyCard, styles.ratingCard]}>
                  <Text style={styles.ratingValue}>{computedData.avgRating.toFixed(1)}</Text>
                  <View style={styles.flex}>
                    <View style={styles.ratingStars}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Ionicons
                          key={i}
                          name={i < Math.round(computedData.avgRating) ? 'star' : 'star-outline'}
                          size={17}
                          color={i < Math.round(computedData.avgRating) ? palette.peachDeep : palette.textSubtle}
                          style={styles.ratingStar}
                        />
                      ))}
                    </View>
                    <Text style={styles.rowSub}>Overall rating</Text>
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scrollView: { flex: 1 },
  flex: { flex: 1 },

  topRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  topText: { flex: 1, marginLeft: 14, marginRight: 10 },
  userName: { ...fonts.semibold, fontSize: 20, color: palette.text, letterSpacing: -0.3 },
  subRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  subText: { ...fonts.medium, fontSize: 15, color: palette.textMuted, flexShrink: 1 },
  kycTag: { marginLeft: 8 },

  balanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    marginTop: 26,
  },
  balanceLabel: { ...fonts.medium, fontSize: 15, color: palette.text },
  balanceValue: {
    ...fonts.semibold,
    fontSize: 38,
    letterSpacing: -1,
    color: palette.text,
    marginTop: 4,
    marginRight: 12,
  },

  quickRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 18,
  },

  panel: {
    marginTop: 20,
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 16,
    paddingTop: 18,
    minHeight: 500,
  },

  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 14,
  },
  kpiTile: {
    width: '48.5%',
    backgroundColor: palette.bg,
    borderRadius: radii.lg,
    padding: 14,
  },
  kpiIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  kpiValue: { ...fonts.semibold, fontSize: 22, letterSpacing: -0.5, color: palette.text },
  kpiLabel: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginTop: 2 },

  featureCard: {
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 12,
    minHeight: 160,
    overflow: 'hidden',
    alignItems: 'flex-start',
  },
  featureArt: { position: 'absolute', right: -30, bottom: -26 },
  featureBody: { width: '66%' },
  featureTitle: {
    ...fonts.bold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: palette.text,
    marginTop: 12,
  },
  featureDesc: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginTop: 6 },
  featureBtn: { alignSelf: 'flex-start', marginTop: 14 },
  featureTrack: { marginTop: 14 },
  featureMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  featureMetaTitle: { ...fonts.semibold, fontSize: 14, color: palette.text },
  featureMetaSub: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 2 },

  sectionGap: { marginTop: 18, marginBottom: 10 },

  greyCard: {
    backgroundColor: palette.surfaceDim,
    borderRadius: radii.xl,
    paddingHorizontal: 14,
  },

  alertRight: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  alertAction: {
    backgroundColor: palette.ink,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    height: 30,
    justifyContent: 'center',
  },
  alertActionText: { ...fonts.semibold, fontSize: 12.5, color: palette.textInverse },
  alertDismiss: { marginLeft: 8 },

  bookingsList: { marginTop: 6 },
  bookingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  bookingText: { flex: 1, marginLeft: 12, marginRight: 8 },
  rowTitle: { ...fonts.semibold, fontSize: 15.5, color: palette.text },
  rowSub: { ...fonts.medium, fontSize: 12.5, color: palette.textMuted, marginTop: 2 },
  bookingRight: { alignItems: 'flex-end' },
  bookingAmount: { ...fonts.semibold, fontSize: 15, color: palette.text },
  bookingTag: { marginTop: 6 },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 20,
    backgroundColor: palette.surfaceDim,
    borderRadius: radii.xl,
    marginTop: 4,
  },
  emptyTitle: { ...fonts.semibold, fontSize: 15, color: palette.text, marginTop: 8 },
  emptySub: {
    ...fonts.medium,
    fontSize: 13,
    color: palette.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },

  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceDim,
    borderRadius: radii.xl,
    padding: 10,
    marginBottom: 10,
  },
  listingThumb: { width: 64, height: 64, borderRadius: radii.md },
  listingThumbEmpty: {
    backgroundColor: palette.peachSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  slotStats: { alignItems: 'flex-end', marginLeft: 8 },
  slotValue: { ...fonts.semibold, fontSize: 15, color: palette.success },

  ratingCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  ratingValue: {
    ...fonts.semibold,
    fontSize: 38,
    letterSpacing: -1,
    color: palette.text,
    marginRight: 14,
  },
  ratingStars: { flexDirection: 'row' },
  ratingStar: { marginRight: 3 },
});
