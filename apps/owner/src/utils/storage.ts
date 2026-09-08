import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  DashboardListing,
  DashboardBooking,
  DashboardEarning,
  DashboardNotification,
  DashboardReview,
  DashboardState,
  OwnerProfile as DashboardOwnerProfile,
} from '../constants/mockData';
import {
  seedOwnerProfile,
  seedDashboardState,
  seedDashboardListings,
  seedDashboardBookings,
  seedDashboardEarnings,
  seedDashboardNotifications,
  seedDashboardReviews,
  seedFullListings,
  defaultListingsUIState,
  seedFullBookings,
  defaultBookingsUIState,
} from '../constants/mockData';
import type {
  FullListing,
  ListingsUIState,
  ListingStatus,
  ListingFilterStatus,
  ListingSortOption,
  VehicleType,
  FullBooking,
  BookingsUIState,
  BookingStatus,
  BookingTabType,
  BookingSortOption,
  DateRangeOption,
  BookingsTabCounts,
} from '../types/models';

// Storage keys
export const STORAGE_KEYS = {
  HEADER_PREFERENCES: 'owners:headerPreferences',
  OWNER_PROFILE: 'owners:ownerProfile',
  KYC_SUBMITTED: 'owners:kycSubmitted',
  DASHBOARD_STATE: 'owners:dashboardState',
  DASHBOARD_LISTINGS: 'owners:dashboardListings',
  DASHBOARD_BOOKINGS: 'owners:dashboardBookings',
  DASHBOARD_EARNINGS: 'owners:dashboardEarnings',
  DASHBOARD_NOTIFICATIONS: 'owners:dashboardNotifications',
  DASHBOARD_REVIEWS: 'owners:dashboardReviews',
  DATA_SEEDED: 'owners:dataSeeded',
  // Tab Navigation
  LAST_SELECTED_TAB: 'owners:lastSelectedTab',
  TAB_BADGE_STATE: 'owners:tabBadgeState',
} as const;

// Types for header preferences
export interface HeaderPreferences {
  lastUsedVariant: Record<string, 'standard' | 'large' | 'search'>;
  showSubtitle: boolean;
  compactMode: boolean;
}

export interface OwnerProfile {
  ownerName: string;
  verificationStatus: 'verified' | 'pending' | 'rejected' | 'unverified';
  unreadNotificationsCount: number;
}

// Default values
const DEFAULT_HEADER_PREFERENCES: HeaderPreferences = {
  lastUsedVariant: {
    Dashboard: 'large',
    Listings: 'standard',
    Bookings: 'standard',
    Earnings: 'standard',
  },
  showSubtitle: true,
  compactMode: false,
};

const DEFAULT_OWNER_PROFILE: OwnerProfile = {
  ownerName: 'Owner',
  verificationStatus: 'unverified',
  unreadNotificationsCount: 0,
};

// Safe JSON parsing utility
function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Get header preferences from storage
export async function getHeaderPreferences(): Promise<HeaderPreferences> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.HEADER_PREFERENCES);
    return safeJsonParse(stored, DEFAULT_HEADER_PREFERENCES);
  } catch {
    return DEFAULT_HEADER_PREFERENCES;
  }
}

// Save header preferences to storage
export async function saveHeaderPreferences(
  preferences: Partial<HeaderPreferences>
): Promise<void> {
  try {
    const current = await getHeaderPreferences();
    const updated = { ...current, ...preferences };
    await AsyncStorage.setItem(
      STORAGE_KEYS.HEADER_PREFERENCES,
      JSON.stringify(updated)
    );
  } catch (error) {
    console.error('Failed to save header preferences:', error);
  }
}

// Update a single preference
export async function updateHeaderPreference<K extends keyof HeaderPreferences>(
  key: K,
  value: HeaderPreferences[K]
): Promise<void> {
  await saveHeaderPreferences({ [key]: value });
}

// Get owner profile from storage
export async function getOwnerProfile(): Promise<OwnerProfile> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.OWNER_PROFILE);
    return safeJsonParse(stored, DEFAULT_OWNER_PROFILE);
  } catch {
    return DEFAULT_OWNER_PROFILE;
  }
}

// Save owner profile to storage
export async function saveOwnerProfile(
  profile: Partial<OwnerProfile>
): Promise<void> {
  try {
    const current = await getOwnerProfile();
    const updated = { ...current, ...profile };
    await AsyncStorage.setItem(
      STORAGE_KEYS.OWNER_PROFILE,
      JSON.stringify(updated)
    );
  } catch (error) {
    console.error('Failed to save owner profile:', error);
  }
}

// Check if KYC has been submitted
export async function getKycSubmitted(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.KYC_SUBMITTED);
    return stored === 'true';
  } catch {
    return false;
  }
}

// Set KYC submitted status
export async function setKycSubmitted(submitted: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.KYC_SUBMITTED,
      submitted ? 'true' : 'false'
    );
  } catch (error) {
    console.error('Failed to save KYC submitted status:', error);
  }
}

// Clear all header-related storage (for testing/reset)
export async function clearHeaderStorage(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.HEADER_PREFERENCES,
      STORAGE_KEYS.OWNER_PROFILE,
    ]);
  } catch (error) {
    console.error('Failed to clear header storage:', error);
  }
}

// ============================================================================
// DASHBOARD DATA PERSISTENCE
// ============================================================================

// Check if data has been seeded
export async function isDataSeeded(): Promise<boolean> {
  try {
    const seeded = await AsyncStorage.getItem(STORAGE_KEYS.DATA_SEEDED);
    return seeded === 'true';
  } catch {
    return false;
  }
}

// Seed all dashboard data if not already seeded
// NOTE: Mock seeding disabled — dashboard shows empty state until backend data is wired.
// Restore the commented block below to re-enable mock data for UI testing.
export async function seedDashboardData(): Promise<void> {
  // --- MOCK SEED DISABLED ---
  // try {
  //   const alreadySeeded = await isDataSeeded();
  //   if (alreadySeeded) return;
  //   await AsyncStorage.multiSet([
  //     [STORAGE_KEYS.DASHBOARD_LISTINGS, JSON.stringify(seedDashboardListings)],
  //     [STORAGE_KEYS.DASHBOARD_BOOKINGS, JSON.stringify(seedDashboardBookings)],
  //     [STORAGE_KEYS.DASHBOARD_EARNINGS, JSON.stringify(seedDashboardEarnings)],
  //     [STORAGE_KEYS.DASHBOARD_NOTIFICATIONS, JSON.stringify(seedDashboardNotifications)],
  //     [STORAGE_KEYS.DASHBOARD_REVIEWS, JSON.stringify(seedDashboardReviews)],
  //     [STORAGE_KEYS.DASHBOARD_STATE, JSON.stringify(seedDashboardState)],
  //     [STORAGE_KEYS.DATA_SEEDED, 'true'],
  //   ]);
  //   const currentProfile = await getOwnerProfile();
  //   if (currentProfile.ownerName === 'Owner') {
  //     await saveOwnerProfile({
  //       ownerName: seedOwnerProfile.name,
  //       verificationStatus: seedOwnerProfile.verificationStatus,
  //       unreadNotificationsCount: seedDashboardNotifications.filter(n => !n.read).length,
  //     });
  //   }
  // } catch (error) {
  //   console.error('Failed to seed dashboard data:', error);
  // }
}

// Get dashboard state
export async function getDashboardState(): Promise<DashboardState> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.DASHBOARD_STATE);
    return safeJsonParse(stored, seedDashboardState);
  } catch {
    return seedDashboardState;
  }
}

// Save dashboard state
export async function saveDashboardState(state: Partial<DashboardState>): Promise<void> {
  try {
    const current = await getDashboardState();
    const updated = { ...current, ...state };
    await AsyncStorage.setItem(STORAGE_KEYS.DASHBOARD_STATE, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save dashboard state:', error);
  }
}

// Get dashboard listings
export async function getDashboardListings(): Promise<DashboardListing[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.DASHBOARD_LISTINGS);
    return safeJsonParse(stored, [] as DashboardListing[]);
  } catch {
    return [];
  }
}

// Save dashboard listings
export async function saveDashboardListings(listings: DashboardListing[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.DASHBOARD_LISTINGS, JSON.stringify(listings));
  } catch (error) {
    console.error('Failed to save dashboard listings:', error);
  }
}

// Toggle listing status
export async function toggleListingStatus(listingId: string): Promise<DashboardListing[]> {
  try {
    const listings = await getDashboardListings();
    const updatedListings = listings.map(listing =>
      listing.id === listingId ? { ...listing, isLive: !listing.isLive } : listing
    );
    await saveDashboardListings(updatedListings);

    // Also update dashboard state
    const state = await getDashboardState();
    const newStatus = updatedListings.find(l => l.id === listingId)?.isLive ? 'live' : 'paused';
    await saveDashboardState({
      listingStatuses: { ...state.listingStatuses, [listingId]: newStatus },
    });

    return updatedListings;
  } catch (error) {
    console.error('Failed to toggle listing status:', error);
    return getDashboardListings();
  }
}

// Get dashboard bookings
export async function getDashboardBookings(): Promise<DashboardBooking[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.DASHBOARD_BOOKINGS);
    return safeJsonParse(stored, [] as DashboardBooking[]);
  } catch {
    return [];
  }
}

// Get dashboard earnings
export async function getDashboardEarnings(): Promise<DashboardEarning[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.DASHBOARD_EARNINGS);
    return safeJsonParse(stored, [] as DashboardEarning[]);
  } catch {
    return [];
  }
}

// Get dashboard notifications
export async function getDashboardNotifications(): Promise<DashboardNotification[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.DASHBOARD_NOTIFICATIONS);
    return safeJsonParse(stored, [] as DashboardNotification[]);
  } catch {
    return [];
  }
}

// Get dashboard reviews
export async function getDashboardReviews(): Promise<DashboardReview[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.DASHBOARD_REVIEWS);
    return safeJsonParse(stored, [] as DashboardReview[]);
  } catch {
    return [];
  }
}

// Dismiss an alert
export async function dismissAlert(alertId: string): Promise<void> {
  try {
    const state = await getDashboardState();
    if (!state.dismissedAlerts.includes(alertId)) {
      await saveDashboardState({
        dismissedAlerts: [...state.dismissedAlerts, alertId],
      });
    }
  } catch (error) {
    console.error('Failed to dismiss alert:', error);
  }
}

// Save last selected bookings tab
export async function saveLastBookingsTab(tab: 'requests' | 'active' | 'upcoming'): Promise<void> {
  await saveDashboardState({ lastSelectedBookingsTab: tab });
}

// Get full dashboard owner profile
export async function getDashboardOwnerProfile(): Promise<DashboardOwnerProfile> {
  try {
    const simpleProfile = await getOwnerProfile();
    return {
      id: 'owner_001',
      name: simpleProfile.ownerName,
      verificationStatus: simpleProfile.verificationStatus,
      avatarColorSeed: simpleProfile.ownerName.split(' ').map(n => n[0]).join('').toUpperCase(),
      bankAccountLinked: false,
    };
  } catch {
    return seedOwnerProfile;
  }
}

// Load all dashboard data at once
export interface DashboardData {
  ownerProfile: DashboardOwnerProfile;
  dashboardState: DashboardState;
  listings: DashboardListing[];
  bookings: DashboardBooking[];
  earnings: DashboardEarning[];
  notifications: DashboardNotification[];
  reviews: DashboardReview[];
}

export async function loadAllDashboardData(): Promise<DashboardData> {
  // Clear any previously-seeded mock data (one-time cleanup)
  const seededFlag = await AsyncStorage.getItem(STORAGE_KEYS.DATA_SEEDED);
  if (seededFlag === 'true') {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.DASHBOARD_LISTINGS,
      STORAGE_KEYS.DASHBOARD_BOOKINGS,
      STORAGE_KEYS.DASHBOARD_EARNINGS,
      STORAGE_KEYS.DASHBOARD_NOTIFICATIONS,
      STORAGE_KEYS.DASHBOARD_REVIEWS,
      STORAGE_KEYS.DATA_SEEDED,
    ]);
  }

  const [
    ownerProfile,
    dashboardState,
    listings,
    bookings,
    earnings,
    notifications,
    reviews,
  ] = await Promise.all([
    getDashboardOwnerProfile(),
    getDashboardState(),
    getDashboardListings(),
    getDashboardBookings(),
    getDashboardEarnings(),
    getDashboardNotifications(),
    getDashboardReviews(),
  ]);

  return {
    ownerProfile,
    dashboardState,
    listings,
    bookings,
    earnings,
    notifications,
    reviews,
  };
}

// Clear all dashboard data (for testing/reset)
export async function clearAllDashboardData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.DASHBOARD_STATE,
      STORAGE_KEYS.DASHBOARD_LISTINGS,
      STORAGE_KEYS.DASHBOARD_BOOKINGS,
      STORAGE_KEYS.DASHBOARD_EARNINGS,
      STORAGE_KEYS.DASHBOARD_NOTIFICATIONS,
      STORAGE_KEYS.DASHBOARD_REVIEWS,
      STORAGE_KEYS.DATA_SEEDED,
    ]);
  } catch (error) {
    console.error('Failed to clear dashboard data:', error);
  }
}

// ============================================================================
// TAB NAVIGATION PERSISTENCE
// ============================================================================

// Tab names for type safety
export type TabName = 'Dashboard' | 'Listings' | 'Properties' | 'Compliance' | 'Bookings' | 'Earnings' | 'Staff' | 'StaffRoles' | 'LotSetup' | 'More';

// Badge state interface
export interface TabBadgeState {
  bookingsCount: number; // Pending booking requests count
  hasMoreDot: boolean;   // Dot indicator for More tab (unread alerts/settings)
}

// Default badge state
const DEFAULT_TAB_BADGE_STATE: TabBadgeState = {
  bookingsCount: 0,
  hasMoreDot: false,
};

// Get last selected tab
export async function getLastSelectedTab(): Promise<TabName> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SELECTED_TAB);
    if (stored && ['Dashboard', 'Listings', 'Properties', 'Compliance', 'Bookings', 'Earnings', 'Staff', 'StaffRoles', 'LotSetup', 'More'].includes(stored)) {
      return stored as TabName;
    }
    return 'Dashboard';
  } catch {
    return 'Dashboard';
  }
}

// Save last selected tab
export async function saveLastSelectedTab(tab: TabName): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SELECTED_TAB, tab);
  } catch (error) {
    console.error('Failed to save last selected tab:', error);
  }
}

// Get tab badge state
export async function getTabBadgeState(): Promise<TabBadgeState> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.TAB_BADGE_STATE);
    return safeJsonParse(stored, DEFAULT_TAB_BADGE_STATE);
  } catch {
    return DEFAULT_TAB_BADGE_STATE;
  }
}

// Save tab badge state
export async function saveTabBadgeState(state: Partial<TabBadgeState>): Promise<void> {
  try {
    const current = await getTabBadgeState();
    const updated = { ...current, ...state };
    await AsyncStorage.setItem(STORAGE_KEYS.TAB_BADGE_STATE, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save tab badge state:', error);
  }
}

// Initialize tab badge state from dashboard data
export async function initializeTabBadges(): Promise<TabBadgeState> {
  try {
    // Get pending bookings count
    const bookings = await getDashboardBookings();
    const pendingCount = bookings.filter(b => b.status === 'request').length;

    // Get unread notifications for More dot
    const notifications = await getDashboardNotifications();
    const hasUnread = notifications.some(n => !n.read);

    const badgeState: TabBadgeState = {
      bookingsCount: pendingCount,
      hasMoreDot: hasUnread,
    };

    await saveTabBadgeState(badgeState);
    return badgeState;
  } catch (error) {
    console.error('Failed to initialize tab badges:', error);
    return DEFAULT_TAB_BADGE_STATE;
  }
}

// Update bookings badge count
export async function updateBookingsBadge(count: number): Promise<void> {
  await saveTabBadgeState({ bookingsCount: count });
}

// Update More tab dot indicator
export async function updateMoreDot(hasDot: boolean): Promise<void> {
  await saveTabBadgeState({ hasMoreDot: hasDot });
}

// Clear More tab dot (when user views notifications/alerts)
export async function clearMoreDot(): Promise<void> {
  await updateMoreDot(false);
}

// ============================================================================
// LISTINGS SCREEN PERSISTENCE
// ============================================================================

// Storage keys for listings
const LISTINGS_STORAGE_KEYS = {
  FULL_LISTINGS: 'owners:fullListings',
  LISTINGS_UI_STATE: 'owners:listingsUIState',
  LISTINGS_SEEDED: 'owners:listingsSeeded',
} as const;

// Check if listings have been seeded
export async function isListingsSeeded(): Promise<boolean> {
  try {
    const seeded = await AsyncStorage.getItem(LISTINGS_STORAGE_KEYS.LISTINGS_SEEDED);
    return seeded === 'true';
  } catch {
    return false;
  }
}

// Seed listings data if not already seeded
export async function seedListingsData(): Promise<void> {
  try {
    const alreadySeeded = await isListingsSeeded();
    if (alreadySeeded) return;

    await AsyncStorage.multiSet([
      [LISTINGS_STORAGE_KEYS.FULL_LISTINGS, JSON.stringify(seedFullListings)],
      [LISTINGS_STORAGE_KEYS.LISTINGS_UI_STATE, JSON.stringify(defaultListingsUIState)],
      [LISTINGS_STORAGE_KEYS.LISTINGS_SEEDED, 'true'],
    ]);
  } catch (error) {
    console.error('Failed to seed listings data:', error);
  }
}

// Get all full listings
export async function getFullListings(): Promise<FullListing[]> {
  try {
    await seedListingsData();
    const stored = await AsyncStorage.getItem(LISTINGS_STORAGE_KEYS.FULL_LISTINGS);
    return safeJsonParse(stored, seedFullListings);
  } catch {
    return seedFullListings;
  }
}

// Save all listings
export async function saveFullListings(listings: FullListing[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LISTINGS_STORAGE_KEYS.FULL_LISTINGS, JSON.stringify(listings));
  } catch (error) {
    console.error('Failed to save full listings:', error);
  }
}

// Get listings UI state
export async function getListingsUIState(): Promise<ListingsUIState> {
  try {
    const stored = await AsyncStorage.getItem(LISTINGS_STORAGE_KEYS.LISTINGS_UI_STATE);
    return safeJsonParse(stored, defaultListingsUIState);
  } catch {
    return defaultListingsUIState;
  }
}

// Save listings UI state
export async function saveListingsUIState(state: Partial<ListingsUIState>): Promise<void> {
  try {
    const current = await getListingsUIState();
    const updated = { ...current, ...state };
    await AsyncStorage.setItem(LISTINGS_STORAGE_KEYS.LISTINGS_UI_STATE, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save listings UI state:', error);
  }
}

// Get a single listing by ID
export async function getListingById(listingId: string): Promise<FullListing | null> {
  try {
    const listings = await getFullListings();
    return listings.find(l => l.id === listingId) || null;
  } catch {
    return null;
  }
}

// Update a single listing
export async function updateListing(listingId: string, updates: Partial<FullListing>): Promise<FullListing | null> {
  try {
    const listings = await getFullListings();
    const index = listings.findIndex(l => l.id === listingId);
    if (index === -1) return null;

    const updated = { ...listings[index], ...updates, updatedAt: Date.now() };
    listings[index] = updated;
    await saveFullListings(listings);
    return updated;
  } catch (error) {
    console.error('Failed to update listing:', error);
    return null;
  }
}

// Toggle listing status between ACTIVE and PAUSED (only for verified eligible listings)
export async function toggleFullListingStatus(listingId: string): Promise<FullListing | null> {
  try {
    const listings = await getFullListings();
    const listing = listings.find(l => l.id === listingId);

    if (!listing || !listing.isVerifiedEligible) return null;
    if (listing.status !== 'ACTIVE' && listing.status !== 'PAUSED') return null;

    const newStatus: ListingStatus = listing.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    return await updateListing(listingId, { status: newStatus });
  } catch (error) {
    console.error('Failed to toggle listing status:', error);
    return null;
  }
}

// Delete a listing (soft delete by removing from array)
export async function deleteListing(listingId: string): Promise<boolean> {
  try {
    const listings = await getFullListings();
    const filtered = listings.filter(l => l.id !== listingId);
    if (filtered.length === listings.length) return false;
    await saveFullListings(filtered);
    return true;
  } catch (error) {
    console.error('Failed to delete listing:', error);
    return false;
  }
}

// Duplicate a listing (create a copy as draft)
export async function duplicateListing(listingId: string): Promise<FullListing | null> {
  try {
    const listings = await getFullListings();
    const original = listings.find(l => l.id === listingId);
    if (!original) return null;

    const now = Date.now();
    const duplicated: FullListing = {
      ...original,
      id: `listing_${now}`,
      title: `${original.title} (Copy)`,
      status: 'DRAFT',
      totalEarnings: 0,
      totalBookings: 0,
      rating: undefined,
      isVerifiedEligible: false,
      createdAt: now,
      updatedAt: now,
    };

    await saveFullListings([...listings, duplicated]);
    return duplicated;
  } catch (error) {
    console.error('Failed to duplicate listing:', error);
    return null;
  }
}

// Filter and sort listings
export interface ListingsFilterOptions {
  searchText?: string;
  statusFilter?: ListingFilterStatus;
  vehicleFilters?: VehicleType[];
  sortOption?: ListingSortOption;
}

export function filterAndSortListings(
  listings: FullListing[],
  options: ListingsFilterOptions
): FullListing[] {
  let result = [...listings];

  // Apply search filter
  if (options.searchText && options.searchText.trim()) {
    const search = options.searchText.toLowerCase().trim();
    result = result.filter(l =>
      l.title.toLowerCase().includes(search) ||
      l.locationName.toLowerCase().includes(search) ||
      l.locationArea.toLowerCase().includes(search) ||
      l.locationCity.toLowerCase().includes(search)
    );
  }

  // Apply status filter
  if (options.statusFilter && options.statusFilter !== 'all') {
    result = result.filter(l => l.status === options.statusFilter);
  }

  // Apply vehicle type filter
  if (options.vehicleFilters && options.vehicleFilters.length > 0) {
    result = result.filter(l =>
      options.vehicleFilters!.some(vt => l.vehicleTypes.includes(vt))
    );
  }

  // Apply sorting
  switch (options.sortOption) {
    case 'newest':
      result.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case 'oldest':
      result.sort((a, b) => a.createdAt - b.createdAt);
      break;
    case 'earnings':
      result.sort((a, b) => b.totalEarnings - a.totalEarnings);
      break;
    case 'price_high':
      result.sort((a, b) => b.pricePerHour - a.pricePerHour);
      break;
    case 'price_low':
      result.sort((a, b) => a.pricePerHour - b.pricePerHour);
      break;
    default:
      result.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  return result;
}

// Get listings summary counts (for KPI tiles)
export interface ListingsSummary {
  total: number;
  active: number;
  paused: number;
  draft: number;
  pending: number;
}

export function getListingsSummary(listings: FullListing[]): ListingsSummary {
  return {
    total: listings.length,
    active: listings.filter(l => l.status === 'ACTIVE').length,
    paused: listings.filter(l => l.status === 'PAUSED').length,
    draft: listings.filter(l => l.status === 'DRAFT').length,
    pending: listings.filter(l => l.status === 'PENDING').length,
  };
}

// Load all listings data (listings + UI state)
export interface ListingsData {
  listings: FullListing[];
  uiState: ListingsUIState;
  summary: ListingsSummary;
}

export async function loadAllListingsData(): Promise<ListingsData> {
  await seedListingsData();

  const [listings, uiState] = await Promise.all([
    getFullListings(),
    getListingsUIState(),
  ]);

  return {
    listings,
    uiState,
    summary: getListingsSummary(listings),
  };
}

// Clear all listings data (for testing/reset)
export async function clearAllListingsData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      LISTINGS_STORAGE_KEYS.FULL_LISTINGS,
      LISTINGS_STORAGE_KEYS.LISTINGS_UI_STATE,
      LISTINGS_STORAGE_KEYS.LISTINGS_SEEDED,
    ]);
  } catch (error) {
    console.error('Failed to clear listings data:', error);
  }
}

// ============================================================================
// BOOKINGS SCREEN PERSISTENCE
// ============================================================================

// Storage keys for bookings
const BOOKINGS_STORAGE_KEYS = {
  FULL_BOOKINGS: 'owners:fullBookings',
  BOOKINGS_UI_STATE: 'owners:bookingsUIState',
  BOOKINGS_SEEDED: 'owners:bookingsSeeded',
} as const;

// Check if bookings have been seeded
export async function isBookingsSeeded(): Promise<boolean> {
  try {
    const seeded = await AsyncStorage.getItem(BOOKINGS_STORAGE_KEYS.BOOKINGS_SEEDED);
    return seeded === 'true';
  } catch {
    return false;
  }
}

// Seed bookings data if not already seeded
export async function seedBookingsData(): Promise<void> {
  try {
    const alreadySeeded = await isBookingsSeeded();
    if (alreadySeeded) return;

    await AsyncStorage.multiSet([
      [BOOKINGS_STORAGE_KEYS.FULL_BOOKINGS, JSON.stringify(seedFullBookings)],
      [BOOKINGS_STORAGE_KEYS.BOOKINGS_UI_STATE, JSON.stringify(defaultBookingsUIState)],
      [BOOKINGS_STORAGE_KEYS.BOOKINGS_SEEDED, 'true'],
    ]);
  } catch (error) {
    console.error('Failed to seed bookings data:', error);
  }
}

// Get all bookings
export async function getFullBookings(): Promise<FullBooking[]> {
  try {
    await seedBookingsData();
    const stored = await AsyncStorage.getItem(BOOKINGS_STORAGE_KEYS.FULL_BOOKINGS);
    return safeJsonParse(stored, seedFullBookings);
  } catch {
    return seedFullBookings;
  }
}

// Save all bookings
export async function saveFullBookings(bookings: FullBooking[]): Promise<void> {
  try {
    await AsyncStorage.setItem(BOOKINGS_STORAGE_KEYS.FULL_BOOKINGS, JSON.stringify(bookings));
  } catch (error) {
    console.error('Failed to save bookings:', error);
  }
}

// Get bookings UI state
export async function getBookingsUIState(): Promise<BookingsUIState> {
  try {
    const stored = await AsyncStorage.getItem(BOOKINGS_STORAGE_KEYS.BOOKINGS_UI_STATE);
    return safeJsonParse(stored, defaultBookingsUIState);
  } catch {
    return defaultBookingsUIState;
  }
}

// Save bookings UI state
export async function saveBookingsUIState(state: Partial<BookingsUIState>): Promise<void> {
  try {
    const current = await getBookingsUIState();
    const updated = { ...current, ...state };
    await AsyncStorage.setItem(BOOKINGS_STORAGE_KEYS.BOOKINGS_UI_STATE, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save bookings UI state:', error);
  }
}

// Get a single booking by ID
export async function getBookingById(bookingId: string): Promise<FullBooking | null> {
  try {
    const bookings = await getFullBookings();
    return bookings.find(b => b.id === bookingId) || null;
  } catch {
    return null;
  }
}

// Update a single booking
export async function updateBooking(bookingId: string, updates: Partial<FullBooking>): Promise<FullBooking | null> {
  try {
    const bookings = await getFullBookings();
    const index = bookings.findIndex(b => b.id === bookingId);
    if (index === -1) return null;

    const updated = { ...bookings[index], ...updates };
    bookings[index] = updated;
    await saveFullBookings(bookings);
    return updated;
  } catch (error) {
    console.error('Failed to update booking:', error);
    return null;
  }
}

// Update booking status
export async function updateBookingStatus(
  bookingId: string,
  newStatus: BookingStatus,
  notes?: string
): Promise<FullBooking | null> {
  try {
    const updates: Partial<FullBooking> = { status: newStatus };
    if (notes) updates.notes = notes;
    return await updateBooking(bookingId, updates);
  } catch (error) {
    console.error('Failed to update booking status:', error);
    return null;
  }
}

// Approve a booking request (REQUESTED -> UPCOMING)
export async function approveBooking(bookingId: string): Promise<FullBooking | null> {
  return updateBookingStatus(bookingId, 'UPCOMING');
}

// Reject a booking request (REQUESTED -> REJECTED)
export async function rejectBooking(bookingId: string): Promise<FullBooking | null> {
  return updateBookingStatus(bookingId, 'REJECTED', 'Rejected by owner');
}

// Cancel an upcoming booking (UPCOMING -> CANCELLED)
export async function cancelBooking(bookingId: string): Promise<FullBooking | null> {
  return updateBookingStatus(bookingId, 'CANCELLED', 'Cancelled by owner');
}

// Mark booking as completed (ACTIVE -> COMPLETED)
export async function completeBooking(bookingId: string): Promise<FullBooking | null> {
  return updateBookingStatus(bookingId, 'COMPLETED');
}

// Mark booking as no-show (ACTIVE -> NO_SHOW)
export async function markBookingNoShow(bookingId: string): Promise<FullBooking | null> {
  return updateBookingStatus(bookingId, 'NO_SHOW', 'Renter did not arrive');
}

// Filter bookings by tab
export function filterBookingsByTab(bookings: FullBooking[], tab: BookingTabType): FullBooking[] {
  switch (tab) {
    case 'requests':
      return bookings.filter(b => b.status === 'REQUESTED');
    case 'upcoming':
      return bookings.filter(b => b.status === 'UPCOMING');
    case 'active':
      return bookings.filter(b => b.status === 'ACTIVE');
    case 'past':
      return bookings.filter(b => ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'].includes(b.status));
    default:
      return bookings;
  }
}

// Filter and sort bookings
export interface BookingsFilterOptions {
  searchText?: string;
  tab?: BookingTabType;
  vehicleFilter?: VehicleType | 'all';
  statusFilter?: BookingStatus | 'all'; // For past tab
  dateRange?: DateRangeOption;
  customDateStart?: string;
  customDateEnd?: string;
  sortOption?: BookingSortOption;
}

export function filterAndSortBookings(
  bookings: FullBooking[],
  options: BookingsFilterOptions
): FullBooking[] {
  let result = [...bookings];

  // Filter by tab first
  if (options.tab) {
    result = filterBookingsByTab(result, options.tab);
  }

  // Apply search filter
  if (options.searchText && options.searchText.trim()) {
    const search = options.searchText.toLowerCase().trim();
    result = result.filter(b =>
      b.listingName.toLowerCase().includes(search) ||
      b.addressLine.toLowerCase().includes(search) ||
      b.renterName.toLowerCase().includes(search) ||
      b.vehicle.plate.toLowerCase().includes(search)
    );
  }

  // Apply vehicle filter
  if (options.vehicleFilter && options.vehicleFilter !== 'all') {
    result = result.filter(b => b.vehicle.type === options.vehicleFilter);
  }

  // Apply status filter (for past tab)
  if (options.statusFilter && options.statusFilter !== 'all' && options.tab === 'past') {
    result = result.filter(b => b.status === options.statusFilter);
  }

  // Apply date range filter
  if (options.dateRange && options.dateRange !== 'all') {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let rangeStart: Date;
    let rangeEnd: Date = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year ahead

    switch (options.dateRange) {
      case 'today':
        rangeStart = startOfDay;
        rangeEnd = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'this_week':
        const dayOfWeek = now.getDay();
        rangeStart = new Date(startOfDay.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
        rangeEnd = new Date(rangeStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'this_month':
        rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
        rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'custom':
        if (options.customDateStart && options.customDateEnd) {
          rangeStart = new Date(options.customDateStart);
          rangeEnd = new Date(options.customDateEnd);
        } else {
          rangeStart = new Date(0);
        }
        break;
      default:
        rangeStart = new Date(0);
    }

    result = result.filter(b => {
      const bookingStart = new Date(b.startAt);
      return bookingStart >= rangeStart && bookingStart < rangeEnd;
    });
  }

  // Apply sorting
  switch (options.sortOption) {
    case 'newest':
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
    case 'start_soonest':
      result.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      break;
    case 'price_high':
      result.sort((a, b) => b.priceTotal - a.priceTotal);
      break;
    default:
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  return result;
}

// Get tab counts
export function getBookingsTabCounts(bookings: FullBooking[]): BookingsTabCounts {
  return {
    requests: bookings.filter(b => b.status === 'REQUESTED').length,
    upcoming: bookings.filter(b => b.status === 'UPCOMING').length,
    active: bookings.filter(b => b.status === 'ACTIVE').length,
    past: bookings.filter(b => ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'].includes(b.status)).length,
  };
}

// Load all bookings data
export interface BookingsData {
  bookings: FullBooking[];
  uiState: BookingsUIState;
  tabCounts: BookingsTabCounts;
}

export async function loadAllBookingsData(): Promise<BookingsData> {
  await seedBookingsData();

  const [bookings, uiState] = await Promise.all([
    getFullBookings(),
    getBookingsUIState(),
  ]);

  return {
    bookings,
    uiState,
    tabCounts: getBookingsTabCounts(bookings),
  };
}

// Clear all bookings data (for testing/reset)
export async function clearAllBookingsData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      BOOKINGS_STORAGE_KEYS.FULL_BOOKINGS,
      BOOKINGS_STORAGE_KEYS.BOOKINGS_UI_STATE,
      BOOKINGS_STORAGE_KEYS.BOOKINGS_SEEDED,
    ]);
  } catch (error) {
    console.error('Failed to clear bookings data:', error);
  }
}

// Reset bookings to seed data (for error recovery)
export async function resetBookingsToSeed(): Promise<void> {
  try {
    await clearAllBookingsData();
    await seedBookingsData();
  } catch (error) {
    console.error('Failed to reset bookings data:', error);
  }
}

// ============================================================================
// EARNINGS SCREEN PERSISTENCE
// ============================================================================

import {
  seedEarningsTransactions,
  defaultEarningsUIState,
  earningsListingOptions,
} from '../constants/mockData';
import type {
  EarningsTransaction,
  EarningsUIState,
  EarningsSummary,
  EarningsRangeOption,
  EarningsFilters,
  TransactionSection,
  DailyEarnings,
  EarningsSortOption,
} from '../types/models';

// Storage keys for earnings
const EARNINGS_STORAGE_KEYS = {
  TRANSACTIONS: 'owners:earningsTransactions',
  UI_STATE: 'owners:earningsUIState',
  SEEDED: 'owners:earningsSeeded',
} as const;

// Platform fee percentage (8%)
const PLATFORM_FEE_RATE = 0.08;

// Check if earnings have been seeded
export async function isEarningsSeeded(): Promise<boolean> {
  try {
    const seeded = await AsyncStorage.getItem(EARNINGS_STORAGE_KEYS.SEEDED);
    return seeded === 'true';
  } catch {
    return false;
  }
}

// Seed earnings data if not already seeded
export async function seedEarningsData(): Promise<void> {
  try {
    const alreadySeeded = await isEarningsSeeded();
    if (alreadySeeded) return;

    await AsyncStorage.multiSet([
      [EARNINGS_STORAGE_KEYS.TRANSACTIONS, JSON.stringify(seedEarningsTransactions)],
      [EARNINGS_STORAGE_KEYS.UI_STATE, JSON.stringify(defaultEarningsUIState)],
      [EARNINGS_STORAGE_KEYS.SEEDED, 'true'],
    ]);
  } catch (error) {
    console.error('Failed to seed earnings data:', error);
  }
}

// Get all transactions
export async function getEarningsTransactions(): Promise<EarningsTransaction[]> {
  try {
    await seedEarningsData();
    const stored = await AsyncStorage.getItem(EARNINGS_STORAGE_KEYS.TRANSACTIONS);
    return safeJsonParse(stored, seedEarningsTransactions);
  } catch {
    return seedEarningsTransactions;
  }
}

// Save all transactions
export async function saveEarningsTransactions(transactions: EarningsTransaction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(EARNINGS_STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  } catch (error) {
    console.error('Failed to save earnings transactions:', error);
  }
}

// Get earnings UI state
export async function getEarningsUIState(): Promise<EarningsUIState> {
  try {
    const stored = await AsyncStorage.getItem(EARNINGS_STORAGE_KEYS.UI_STATE);
    return safeJsonParse(stored, defaultEarningsUIState);
  } catch {
    return defaultEarningsUIState;
  }
}

// Save earnings UI state
export async function saveEarningsUIState(state: Partial<EarningsUIState>): Promise<void> {
  try {
    const current = await getEarningsUIState();
    const updated = { ...current, ...state };
    await AsyncStorage.setItem(EARNINGS_STORAGE_KEYS.UI_STATE, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save earnings UI state:', error);
  }
}

// Get a single transaction by ID
export async function getTransactionById(transactionId: string): Promise<EarningsTransaction | null> {
  try {
    const transactions = await getEarningsTransactions();
    return transactions.find(t => t.id === transactionId) || null;
  } catch {
    return null;
  }
}

// Get date range based on selected option
export function getDateRangeForOption(
  range: EarningsRangeOption,
  customRange?: { fromISO: string; toISO: string }
): { start: Date; end: Date } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (range) {
    case 'today':
      return {
        start: startOfDay,
        end: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000),
      };
    case 'week': {
      const dayOfWeek = now.getDay();
      const weekStart = new Date(startOfDay.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
      return {
        start: weekStart,
        end: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000),
      };
    }
    case 'month':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
    case 'custom':
      if (customRange) {
        return {
          start: new Date(customRange.fromISO),
          end: new Date(customRange.toISO),
        };
      }
      // Default to last 30 days if custom range not provided
      return {
        start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        end: now,
      };
    default:
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
  }
}

// Filter transactions by date range
export function filterTransactionsByDateRange(
  transactions: EarningsTransaction[],
  range: EarningsRangeOption,
  customRange?: { fromISO: string; toISO: string }
): EarningsTransaction[] {
  const { start, end } = getDateRangeForOption(range, customRange);

  return transactions.filter(t => {
    const txDate = new Date(t.createdAt);
    return txDate >= start && txDate < end;
  });
}

// Filter transactions by filters
export function filterTransactionsByFilters(
  transactions: EarningsTransaction[],
  filters: EarningsFilters
): EarningsTransaction[] {
  let result = [...transactions];

  // Filter by status
  if (filters.status.length > 0) {
    result = result.filter(t => filters.status.includes(t.status));
  }

  // Filter by payout status
  if (filters.payoutStatus.length > 0) {
    result = result.filter(t => filters.payoutStatus.includes(t.payoutStatus));
  }

  // Filter by type
  if (filters.types.length > 0) {
    result = result.filter(t => filters.types.includes(t.type));
  }

  // Filter by listing
  if (filters.listingIds.length > 0) {
    result = result.filter(t => filters.listingIds.includes(t.listingId));
  }

  return result;
}

// Search transactions
export function searchTransactions(
  transactions: EarningsTransaction[],
  searchText: string
): EarningsTransaction[] {
  if (!searchText.trim()) return transactions;

  const search = searchText.toLowerCase().trim();
  return transactions.filter(t =>
    t.listingName.toLowerCase().includes(search) ||
    (t.bookingRef && t.bookingRef.toLowerCase().includes(search)) ||
    (t.renterName && t.renterName.toLowerCase().includes(search)) ||
    (t.note && t.note.toLowerCase().includes(search))
  );
}

// Sort transactions
export function sortTransactions(
  transactions: EarningsTransaction[],
  sortOption: EarningsSortOption
): EarningsTransaction[] {
  const sorted = [...transactions];

  switch (sortOption) {
    case 'newest':
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
    case 'oldest':
      sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      break;
    case 'amount_high':
      sorted.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      break;
    case 'amount_low':
      sorted.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
      break;
    default:
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  return sorted;
}

// Full filter and sort pipeline
export interface EarningsFilterOptions {
  range: EarningsRangeOption;
  customRange?: { fromISO: string; toISO: string };
  filters: EarningsFilters;
  searchText: string;
  sortOption: EarningsSortOption;
}

export function filterAndSortTransactions(
  transactions: EarningsTransaction[],
  options: EarningsFilterOptions
): EarningsTransaction[] {
  let result = [...transactions];

  // Filter by date range
  result = filterTransactionsByDateRange(result, options.range, options.customRange);

  // Filter by filters
  result = filterTransactionsByFilters(result, options.filters);

  // Search
  result = searchTransactions(result, options.searchText);

  // Sort
  result = sortTransactions(result, options.sortOption);

  return result;
}

// Calculate earnings summary from transactions
export function calculateEarningsSummary(transactions: EarningsTransaction[]): EarningsSummary {
  // Gross = sum of positive amounts for completed/pending (exclude failed)
  const gross = transactions
    .filter(t => t.amount > 0 && (t.status === 'completed' || t.status === 'pending'))
    .reduce((sum, t) => sum + t.amount, 0);

  // Fees = 8% of gross
  const fees = Math.round(gross * PLATFORM_FEE_RATE);

  // Net = gross - fees
  const net = gross - fees;

  // Pending = sum of unpaid payout items
  const pending = transactions
    .filter(t => t.amount > 0 && t.payoutStatus === 'unpaid' && t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    gross,
    fees,
    net,
    pending,
    currency: 'INR',
  };
}

// Group transactions by day for SectionList
export function groupTransactionsByDay(transactions: EarningsTransaction[]): TransactionSection[] {
  const groups: Record<string, EarningsTransaction[]> = {};

  transactions.forEach(t => {
    const date = new Date(t.createdAt);
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(t);
  });

  // Convert to sections array
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a)) // Sort by date descending
    .map(([dateKey, data]) => {
      let title: string;

      if (dateKey === today) {
        title = 'Today';
      } else if (dateKey === yesterday) {
        title = 'Yesterday';
      } else {
        const date = new Date(dateKey);
        title = date.toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });
      }

      return { title, dateKey, data };
    });
}

// Calculate daily earnings for chart
export function calculateDailyEarnings(
  transactions: EarningsTransaction[],
  days: number = 7
): DailyEarnings[] {
  const now = new Date();
  const result: DailyEarnings[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];

    const dayTransactions = transactions.filter(t => {
      const txDate = new Date(t.createdAt).toISOString().split('T')[0];
      return txDate === dateKey;
    });

    const net = dayTransactions
      .filter(t => t.status === 'completed' || t.status === 'pending')
      .reduce((sum, t) => sum + t.amount, 0);

    result.push({
      date: dateKey,
      net: Math.round(net * (1 - PLATFORM_FEE_RATE)),
      transactionCount: dayTransactions.length,
    });
  }

  return result;
}

// Get active filters count
export function getActiveFiltersCount(filters: EarningsFilters): number {
  return (
    filters.status.length +
    filters.payoutStatus.length +
    filters.types.length +
    filters.listingIds.length
  );
}

// Check if any filters are active
export function hasActiveFilters(filters: EarningsFilters): boolean {
  return getActiveFiltersCount(filters) > 0;
}

// Get listing options for filter
export function getEarningsListingOptions(): { id: string; name: string }[] {
  return earningsListingOptions;
}

// Load all earnings data
export interface EarningsData {
  transactions: EarningsTransaction[];
  uiState: EarningsUIState;
  summary: EarningsSummary;
  filteredTransactions: EarningsTransaction[];
  sections: TransactionSection[];
  dailyEarnings: DailyEarnings[];
}

export async function loadAllEarningsData(): Promise<EarningsData> {
  await seedEarningsData();

  const [transactions, uiState] = await Promise.all([
    getEarningsTransactions(),
    getEarningsUIState(),
  ]);

  // Filter transactions based on UI state
  const filteredTransactions = filterAndSortTransactions(transactions, {
    range: uiState.selectedRange,
    customRange: uiState.customRange,
    filters: uiState.filters,
    searchText: uiState.searchText,
    sortOption: uiState.sortOption,
  });

  // Calculate summary from filtered transactions
  const summary = calculateEarningsSummary(filteredTransactions);

  // Group for sections
  const sections = groupTransactionsByDay(filteredTransactions);

  // Get daily earnings (last 7 days from all transactions in range)
  const rangeTransactions = filterTransactionsByDateRange(
    transactions,
    uiState.selectedRange,
    uiState.customRange
  );
  const dailyEarnings = calculateDailyEarnings(rangeTransactions, 7);

  return {
    transactions,
    uiState,
    summary,
    filteredTransactions,
    sections,
    dailyEarnings,
  };
}

// Clear all earnings data (for testing/reset)
export async function clearAllEarningsData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      EARNINGS_STORAGE_KEYS.TRANSACTIONS,
      EARNINGS_STORAGE_KEYS.UI_STATE,
      EARNINGS_STORAGE_KEYS.SEEDED,
    ]);
  } catch (error) {
    console.error('Failed to clear earnings data:', error);
  }
}

// Reset earnings to seed data (for error recovery)
export async function resetEarningsToSeed(): Promise<void> {
  try {
    await clearAllEarningsData();
    await seedEarningsData();
  } catch (error) {
    console.error('Failed to reset earnings data:', error);
  }
}
