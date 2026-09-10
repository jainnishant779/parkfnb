import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Components
import { AppHeader } from '../../components/headers';
import type { HeaderStat } from '../../components/headers';
import {
  KpiCard,
  SectionCard,
  SegmentedControl,
  BookingRow,
  ListingRow,
  AlertRow,
  QuickActionTile,
  ReviewCard,
  EmptyState,
} from '../../components/dashboard';

// Theme & Utils
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { resolveImageUri } from '../../utils/imageUri';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatOwnerGreeting,
  formatPercentage,
} from '../../utils/formatters';
import {
  loadAllDashboardData,
  toggleListingStatus,
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
import type { StatusPillVariant } from '../../components/headers/StatusPill';
import { useAuth } from '../../context/AuthContext';
import { bookingService } from '../../services/bookingService';
import { listingService } from '../../services/listingService';
import earningsService, { startOfWeek, startOfToday, startOfMonth } from '../../services/earningsService';
import type { ApiBooking, ApiProperty, ApiOwnerStats } from '../../types/api';
import type { DashboardBooking, DashboardListing, DashboardReview } from '../../constants/mockData';

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
       'Unknown Renter')
    : 'Unknown Renter';
  const renterInitials = renterName
    .split(' ')
    .map((n: string) => n[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

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
  // Force light mode for dashboard
  const theme = useMemo(() => getTheme(false), []);

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
  const [isScrolled, setIsScrolled] = useState(false);

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

  // Status variant for header pill
  const statusVariant: StatusPillVariant | undefined = useMemo(() => {
    if (kycStatus === 'verified')  return 'verified'  as StatusPillVariant;
    if (kycStatus === 'submitted') return 'pending'   as StatusPillVariant;
    if (kycStatus === 'rejected')  return 'rejected'  as StatusPillVariant;
    return undefined;
  }, [kycStatus]);

  // Bookings for the currently selected tab (max 3 on dashboard)
  const currentBookings = useMemo(() => {
    switch (bookingsTab) {
      case 'requests': return computedData.requestBookings.slice(0, 3);
      case 'active':   return computedData.activeBookings.slice(0, 3);
      case 'upcoming': return computedData.upcomingBookings.slice(0, 3);
      default:         return [];
    }
  }, [bookingsTab, computedData]);

  // Header stat tiles. Every figure is live: listings and pending requests come
  // from the bookings/listings fetches, active bookings and monthly revenue
  // from GET /owners/:id/stats. Currency is compacted because the tile is a
  // quarter of the screen width.
  const headerStats = useMemo((): HeaderStat[] => [
    {
      icon: 'business-outline',
      value: computedData.totalListings.toString(),
      label: 'Listings',
      color: 'primary',
      onPress: handleViewAllListings,
    },
    {
      icon: 'hourglass-outline',
      value: computedData.requestsCount.toString(),
      label: 'Requests',
      color: 'warning',
      onPress: handleViewBookingRequests,
    },
    {
      icon: 'car-outline',
      value: computedData.activeBookingsCount.toString(),
      label: 'Active',
      color: 'success',
      onPress: handleViewAllBookings,
    },
    {
      icon: 'wallet-outline',
      value: formatCurrencyCompact(computedData.monthEarnings),
      label: 'This Month',
      color: 'primary',
      onPress: () => navigation.navigate(ROUTES.TABS.EARNINGS as never),
    },
  ], [
    computedData,
    handleViewAllListings,
    handleViewBookingRequests,
    handleViewAllBookings,
    navigation,
  ]);

  const bookingsSegmentOptions = useMemo(() => [
    { key: 'requests' as BookingsTab, label: 'Requests', badge: computedData.requestsCount },
    { key: 'active'   as BookingsTab, label: 'Active' },
    { key: 'upcoming' as BookingsTab, label: 'Upcoming' },
  ], [computedData]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <AppHeader
        variant="brand"
        title={`${formatOwnerGreeting(firstName)} 👋`}
        subtitle="Manage your parking. Grow your business."
        brandTagline="Your Space. Our Technology. More Possibilities."
        stats={headerStats}
        status={statusVariant}
        rightActions={[
          {
            icon: 'notifications',
            label: 'Notifications',
            onPress: handleNotifications,
            badgeCount: computedData.unreadCount,
          },
        ]}
        showDivider={false}
        elevated={isScrolled}
        isScrolled={isScrolled}
        testID="dashboard-header"
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
        onScroll={(e) => {
          setIsScrolled(e.nativeEvent.contentOffset.y > 10);
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* KPI Cards. Active Bookings lives in the header stat row now, so this
            carousel carries only the figures the header doesn't show. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.kpiRow}
          contentContainerStyle={styles.kpiRowContent}
        >
          <KpiCard
            icon="cash"
            value={formatCurrency(computedData.todayEarnings)}
            label="Today's Earnings"
            color="success"
            onPress={() => navigation.navigate(ROUTES.TABS.EARNINGS as never)}
          />
          <KpiCard
            icon="trending-up"
            value={formatCurrency(computedData.weekEarnings)}
            label="This Week"
            color="primary"
            onPress={() => navigation.navigate(ROUTES.TABS.EARNINGS as never)}
          />
          <KpiCard
            icon="stats-chart"
            value={formatPercentage(computedData.occupancyRate)}
            label="Occupancy"
            color="primary"
            onPress={handleViewAllListings}
          />
        </ScrollView>

        {/* Alerts */}
        {alerts.length > 0 && (
          <View style={styles.alertsSection}>
            {alerts.map(alert => (
              <AlertRow
                key={alert.id}
                id={alert.id}
                type={alert.type}
                title={alert.title}
                description={alert.description}
                actionLabel={alert.actionLabel}
                onAction={() => {
                  if (alert.type === 'kyc') handleNavigateToKyc();
                  else if (alert.type === 'bank') handleNavigateToBankSetup();
                  else if (alert.type === 'listing') handleCompleteFirstListing();
                  else handleViewBookingRequests();
                }}
                onDismiss={handleDismissAlert}
              />
            ))}
          </View>
        )}

        {/* Bookings Section */}
        <SectionCard
          title="Bookings"
          rightAction={{ label: 'View all', onPress: handleViewAllBookings }}
        >
          <SegmentedControl
            options={bookingsSegmentOptions}
            selectedKey={bookingsTab}
            onSelect={handleBookingsTabChange}
          />

          <View style={styles.bookingsList}>
            {currentBookings.length === 0 ? (
              <EmptyState
                icon="calendar-outline"
                title={`No ${bookingsTab} bookings`}
                description={
                  bookingsTab === 'requests'
                    ? 'New booking requests will appear here'
                    : `Your ${bookingsTab} bookings will show up here`
                }
                compact
              />
            ) : (
              currentBookings.map((booking, index) => (
                <BookingRow
                  key={booking.id}
                  {...booking}
                  isLast={index === currentBookings.length - 1}
                  onPress={() =>
                    (navigation as any).navigate(ROUTES.BOOKING_DETAILS, {
                      bookingId: booking.id,
                    })
                  }
                />
              ))
            )}
          </View>
        </SectionCard>

        {/* Listings / IOT Setup / Compliance Templates / Properties */}
        {isIndustrialOwner ? (
          <SectionCard
            title="Compliance Templates"
            rightAction={{ label: 'View all', onPress: handleViewCompliance }}
          >
            {complianceTemplates.length === 0 ? (
              <EmptyState
                icon="document-text-outline"
                title="No templates yet"
                description="Create compliance templates to manage document requirements"
                compact
              />
            ) : (
              <View style={styles.templatesList}>
                {complianceTemplates.slice(0, 3).map((template, index) => (
                  <Pressable
                    key={template.id}
                    style={[
                      styles.templateItem,
                      { backgroundColor: theme.borderLight },
                      index === Math.min(complianceTemplates.length - 1, 2) &&
                        styles.templateItemLast,
                    ]}
                    onPress={handleViewCompliance}
                  >
                    <View style={[styles.templateIcon, { backgroundColor: theme.primaryLight }]}>
                      <Ionicons name="document-text-outline" size={18} color={theme.primary} />
                    </View>
                    <View style={styles.templateContent}>
                      <Text style={[styles.templateName, { color: theme.text }]}>
                        {template.name}
                      </Text>
                      <Text style={[styles.templateMeta, { color: theme.textMuted }]}>
                        {template.requiredTypes.length} required documents
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}
          </SectionCard>
        ) : isEmptyLandOwner ? (
          <SectionCard
            title="IOT Setup"
            rightAction={{
              label: 'Configure',
              onPress: () => (navigation as any).navigate('IoTIntegrations'),
            }}
          >
            <View style={styles.iotSetupContainer}>
              <View style={styles.iotSetupIconContainer}>
                <Ionicons name="hardware-chip-outline" size={32} color={theme.primary} />
              </View>
              <Text style={[styles.iotSetupTitle, { color: theme.text }]}>
                Connect Your Devices
              </Text>
              <Text style={[styles.iotSetupDescription, { color: theme.textMuted }]}>
                Set up sensors, cameras, and access controls for your parking lot
              </Text>
              <TouchableOpacity
                style={[styles.iotSetupButton, { backgroundColor: theme.primary }]}
                onPress={() => (navigation as any).navigate('IoTIntegrations')}
              >
                <Ionicons name="settings-outline" size={18} color="#FFF" />
                <Text style={styles.iotSetupButtonText}>Start Setup</Text>
              </TouchableOpacity>
            </View>
          </SectionCard>
        ) : isResidentialOwner ? (
          <SectionCard
            title="Properties"
            rightAction={{
              label: 'Manage',
              onPress: () => (navigation as any).navigate(ROUTES.TABS.PROPERTIES),
            }}
          >
            <View style={styles.listingsList}>
              {properties.length === 0 ? (
                <EmptyState
                  icon="home-outline"
                  title="No properties yet"
                  description="Add your first property to manage parking slots"
                  compact
                />
              ) : (
                properties.slice(0, 3).map((property, index) => (
                  <Pressable
                    key={property.id}
                    style={[
                      styles.propertyRow,
                      { borderBottomColor: theme.borderLight },
                      index === Math.min(properties.length - 1, 2) && styles.propertyRowLast,
                    ]}
                    onPress={() => (navigation as any).navigate(ROUTES.TABS.PROPERTIES)}
                  >
                    <View style={[styles.propertyIcon, { backgroundColor: theme.primaryLight }]}>
                      <Ionicons name="home-outline" size={20} color={theme.primary} />
                    </View>
                    <View style={styles.propertyContent}>
                      <Text
                        style={[styles.propertyName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {property.name}
                      </Text>
                      <Text
                        style={[styles.propertyAddress, { color: theme.textMuted }]}
                        numberOfLines={1}
                      >
                        {property.addressLine || property.city || 'No address'}
                      </Text>
                    </View>
                    <View style={styles.propertyStats}>
                      <Text style={[styles.propertySlots, { color: theme.success }]}>
                        {property.availableSlots}/{property.totalSlots}
                      </Text>
                      <Text style={[styles.propertySlotsLabel, { color: theme.textMuted }]}>
                        available
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          </SectionCard>
        ) : (
          /* Individual / Commercial / Empty Land listings from real API */
          <SectionCard
            title="Listings"
            rightAction={{ label: 'View all', onPress: handleViewAllListings }}
          >
            <View style={styles.listingsList}>
              {liveListings.length === 0 ? (
                <EmptyState
                  icon="business-outline"
                  title="No listings yet"
                  description="Add your first parking spot to start earning"
                  compact
                />
              ) : (
                liveListings.slice(0, 3).map((listing, index) => (
                  <ListingRow
                    key={listing.id}
                    {...listing}
                    isLast={index === Math.min(liveListings.length - 1, 2)}
                    onToggle={() => handleListingToggle(listing.id)}
                    onPress={() =>
                      (navigation as any).navigate(ROUTES.LISTING_DETAILS, {
                        listingId: listing.id,
                      })
                    }
                  />
                ))
              )}
            </View>
          </SectionCard>
        )}

        {/* Quick Actions */}
        <SectionCard title="Quick Actions" noPadding>
          <View style={styles.quickActionsGrid}>
            <QuickActionTile
              icon="add"
              label={isResidentialOwner ? 'Add Property' : 'Add Listing'}
              color="primary"
              onPress={isResidentialOwner ? handleAddProperty : handleAddListing}
            />
            <QuickActionTile
              icon="calendar"
              label="Set Availability"
              color="success"
              onPress={handleSetAvailability}
            />
            <QuickActionTile
              icon="pricetag"
              label="Create Promo"
              color="warning"
              onPress={handleCreatePromo}
            />
            <QuickActionTile
              icon="wallet"
              label="View Payouts"
              color="primary"
              onPress={handleViewPayouts}
            />
          </View>
        </SectionCard>

        {/* Recent Reviews — hidden for industrial owners */}
        {!isIndustrialOwner && (
          <SectionCard title="Recent Reviews">
            {computedData.avgRating === 0 ? (
              <EmptyState
                icon="star-outline"
                title="No reviews yet"
                description="Reviews from renters will appear here"
                compact
              />
            ) : (
              <View style={[styles.ratingHeader, { borderBottomColor: theme.borderLight }]}>
                <View style={styles.ratingStars}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Text
                      key={i}
                      style={[
                        styles.ratingStar,
                        {
                          color:
                            i < Math.round(computedData.avgRating)
                              ? '#F59E0B'
                              : theme.textMuted,
                        },
                      ]}
                    >
                      ★
                    </Text>
                  ))}
                </View>
                <Text style={[styles.ratingValue, { color: theme.text }]}>
                  {computedData.avgRating.toFixed(1)}
                </Text>
                <Text style={[styles.ratingCount, { color: theme.textMuted }]}>
                  overall rating
                </Text>
              </View>
            )}
          </SectionCard>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing[2],
  },
  kpiRow: {
    marginBottom: spacing[3],
  },
  kpiRowContent: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  section: {
    marginHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    marginBottom: spacing[3],
    padding: spacing[3],
  },
  sectionHeader: {
    marginBottom: spacing[2],
  },
  skeletonTitle: {
    width: 100,
    height: 18,
    borderRadius: borderRadius.sm,
  },
  alertsSection: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[2],
  },
  bookingsList: {
    marginTop: spacing[3],
  },
  listingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    marginBottom: spacing[3],
  },
  listingStat: {
    alignItems: 'center',
    flex: 1,
  },
  listingStatValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
  },
  listingStatLabel: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  listingDivider: {
    width: 1,
    height: 32,
  },
  listingsList: {
    marginTop: spacing[1],
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing[2],
    padding: spacing[3],
  },
  ratingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing[3],
    marginBottom: spacing[1],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
  },
  ratingStars: {
    flexDirection: 'row',
  },
  ratingStar: {
    fontSize: 18,
  },
  ratingValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as any,
  },
  ratingCount: {
    fontSize: fontSize.sm,
  },
  // Compliance Templates Styles
  templatesList: {
    gap: spacing[2],
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[2],
  },
  templateItemLast: {
    marginBottom: 0,
  },
  templateIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  templateContent: {
    flex: 1,
  },
  templateName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    marginBottom: 2,
  },
  templateMeta: {
    fontSize: fontSize.xs,
  },
  // IOT Setup Styles
  iotSetupContainer: {
    alignItems: 'center',
    paddingVertical: spacing[4],
  },
  iotSetupIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  iotSetupTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  iotSetupDescription: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing[4],
    paddingHorizontal: spacing[4],
  },
  iotSetupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
  },
  iotSetupButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
  },
  // Property Row Styles
  propertyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  propertyRowLast: {
    borderBottomWidth: 0,
  },
  propertyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  propertyContent: {
    flex: 1,
  },
  propertyName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    marginBottom: 2,
  },
  propertyAddress: {
    fontSize: fontSize.xs,
  },
  propertyStats: {
    alignItems: 'flex-end',
  },
  propertySlots: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold as any,
  },
  propertySlotsLabel: {
    fontSize: fontSize.xs,
  },
});
