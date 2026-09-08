export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  kycStatus: 'pending' | 'approved' | 'rejected' | 'not_started';
  bankAccountLinked: boolean;
}

// ============================================================================
// LISTING TYPES (FULL MODEL)
// ============================================================================

export type ListingStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'PAUSED';
export type VehicleType = 'CAR' | 'BIKE' | 'TRUCK' | 'VAN';
export type ConfirmationType = 'INSTANT' | 'MANUAL';
export type ListingSortOption = 'newest' | 'oldest' | 'earnings' | 'price_high' | 'price_low';
export type ListingFilterStatus = 'all' | 'ACTIVE' | 'PAUSED' | 'DRAFT' | 'PENDING';

export interface FullListing {
  id: string;
  title: string;
  locationName: string;
  locationArea: string;
  locationCity: string;
  status: ListingStatus;
  pricePerHour: number;
  pricePerDay?: number;
  vehicleTypes: VehicleType[];
  confirmationType: ConfirmationType;
  heightLimit?: number; // in feet
  capacity: number;
  amenities: string[];
  updatedAt: number; // timestamp
  createdAt: number; // timestamp
  thumbnail?: string;
  totalEarnings: number; // for sorting
  totalBookings: number;
  rating?: number;
  isVerifiedEligible: boolean;
}

export interface ListingsUIState {
  searchText: string;
  statusFilter: ListingFilterStatus;
  vehicleFilters: VehicleType[];
  sortOption: ListingSortOption;
}

// Legacy Listing type for compatibility
export interface Listing {
  id: string;
  title: string;
  address: string;
  price: number;
  priceUnit: 'hour' | 'day' | 'week' | 'month';
  status: 'active' | 'inactive' | 'draft';
  imageUrl?: string;
  rating?: number;
  totalBookings: number;
}

export interface Booking {
  id: string;
  listingId: string;
  listingTitle: string;
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  totalAmount: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'booking' | 'payment' | 'review' | 'system';
  isRead: boolean;
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: 'earning' | 'payout' | 'refund';
  amount: number;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export interface Review {
  id: string;
  listingId: string;
  driverName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface Chat {
  id: string;
  driverName: string;
  driverAvatarUrl?: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

// ============================================================================
// BOOKINGS SCREEN TYPES (FULL MODEL)
// ============================================================================

export type BookingStatus = 'REQUESTED' | 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'REJECTED' | 'NO_SHOW';
export type BookingTabType = 'requests' | 'upcoming' | 'active' | 'past';
export type BookingSortOption = 'newest' | 'start_soonest' | 'price_high';
export type DateRangeOption = 'today' | 'this_week' | 'this_month' | 'custom' | 'all';

export interface BookingVehicle {
  type: VehicleType;
  plate: string;
}

export interface BookingFlags {
  peakPricingApplied?: boolean;
  verified?: boolean;
  requiresPermit?: boolean;
}

export interface FullBooking {
  id: string;
  status: BookingStatus;
  listingId: string;
  listingName: string;
  addressLine: string;
  startAt: string; // ISO string
  endAt: string; // ISO string
  vehicle: BookingVehicle;
  renterName: string;
  renterPhone?: string;
  priceTotal: number;
  currency: string;
  createdAt: string; // ISO string
  flags: BookingFlags;
  notes?: string;
}

export interface BookingsUIState {
  selectedTab: BookingTabType;
  searchText: string;
  vehicleFilter: VehicleType | 'all';
  statusFilter: BookingStatus | 'all'; // For past tab
  dateRange: DateRangeOption;
  customDateStart?: string;
  customDateEnd?: string;
  sortOption: BookingSortOption;
}

export interface BookingsTabCounts {
  requests: number;
  upcoming: number;
  active: number;
  past: number;
}

// ============================================================================
// EARNINGS SCREEN TYPES (FULL MODEL)
// ============================================================================

export type TransactionStatus = 'completed' | 'pending' | 'failed' | 'refunded';
export type PayoutStatus = 'paid' | 'unpaid' | 'processing';
export type TransactionType = 'booking' | 'extension' | 'cancellation_fee' | 'adjustment' | 'refund';
export type EarningsRangeOption = 'today' | 'week' | 'month' | 'custom';
export type EarningsViewMode = 'overview' | 'transactions';
export type EarningsSortOption = 'newest' | 'oldest' | 'amount_high' | 'amount_low';

export interface EarningsSummary {
  gross: number;
  fees: number;
  net: number;
  pending: number;
  currency: string;
}

export interface EarningsTransaction {
  id: string;
  createdAt: string; // ISO string
  amount: number; // positive for earnings, negative for refunds/adjustments
  currency: string;
  status: TransactionStatus;
  payoutStatus: PayoutStatus;
  type: TransactionType;
  listingId: string;
  listingName: string;
  bookingRef?: string;
  renterName?: string;
  note?: string;
}

export interface EarningsCustomRange {
  fromISO: string;
  toISO: string;
}

export interface EarningsFilters {
  status: TransactionStatus[];
  payoutStatus: PayoutStatus[];
  types: TransactionType[];
  listingIds: string[];
}

export interface EarningsUIState {
  selectedRange: EarningsRangeOption;
  customRange?: EarningsCustomRange;
  viewMode: EarningsViewMode;
  filters: EarningsFilters;
  searchText: string;
  sortOption: EarningsSortOption;
}

export interface DailyEarnings {
  date: string; // ISO date (YYYY-MM-DD)
  net: number;
  transactionCount: number;
}

export interface TransactionSection {
  title: string;
  dateKey: string;
  data: EarningsTransaction[];
}
