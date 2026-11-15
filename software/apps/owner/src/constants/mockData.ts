import type {
  Listing,
  Booking,
  Notification,
  User,
  FullListing,
  ListingsUIState,
  FullBooking,
  BookingsUIState,
  BookingStatus as FullBookingStatus,
} from '../types/models';

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

export type BookingStatus = 'request' | 'active' | 'upcoming' | 'completed' | 'cancelled' | 'rejected';
export type VerificationStatus = 'verified' | 'pending' | 'rejected' | 'unverified';

export interface DashboardListing {
  id: string;
  title: string;
  location: string;
  capacity: number;
  isLive: boolean;
  photoUri?: string;
  pricePerHour: number;
  availabilityNote?: string;
}

export interface DashboardBooking {
  id: string;
  listingId: string;
  listingTitle: string;
  renterName: string;
  renterInitials: string;
  start: string;
  end: string;
  status: BookingStatus;
  amount: number;
  vehiclePlate?: string;
}

export interface DashboardEarning {
  date: string;
  amount: number;
  bookingId: string;
  listingTitle: string;
}

export interface DashboardNotification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  type: 'booking' | 'payment' | 'system' | 'review';
}

export interface DashboardReview {
  id: string;
  listingId: string;
  renterName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface OwnerProfile {
  id: string;
  name: string;
  verificationStatus: VerificationStatus;
  avatarColorSeed: string;
  email?: string;
  phone?: string;
  bankAccountLinked: boolean;
}

export interface DashboardState {
  dismissedAlerts: string[];
  listingStatuses: Record<string, 'live' | 'paused'>;
  lastSelectedBookingsTab: 'requests' | 'active' | 'upcoming';
}

// ============================================================================
// SEED MOCK DATA FOR DASHBOARD
// ============================================================================

const today = new Date();
const formatISODate = (date: Date) => date.toISOString();

// Helper to create dates relative to today
const daysFromNow = (days: number, hours = 0) => {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  d.setHours(hours, 0, 0, 0);
  return formatISODate(d);
};

const daysAgo = (days: number, hours = 12) => {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  d.setHours(hours, 0, 0, 0);
  return formatISODate(d);
};

// Owner Profile
export const seedOwnerProfile: OwnerProfile = {
  id: 'owner_001',
  name: 'Rajesh Kumar',
  verificationStatus: 'pending',
  avatarColorSeed: 'RK',
  email: 'rajesh.kumar@example.com',
  phone: '+91 98765 43210',
  bankAccountLinked: false,
};

// Dashboard State
export const seedDashboardState: DashboardState = {
  dismissedAlerts: [],
  listingStatuses: {},
  lastSelectedBookingsTab: 'requests',
};

// Listings
export const seedDashboardListings: DashboardListing[] = [
  {
    id: 'listing_001',
    title: 'Indiranagar Covered Parking',
    location: '12th Main, Indiranagar, Bangalore',
    capacity: 4,
    isLive: true,
    pricePerHour: 50,
    availabilityNote: 'Available today',
  },
  {
    id: 'listing_002',
    title: 'Koramangala Open Space',
    location: '80 Feet Road, Koramangala',
    capacity: 8,
    isLive: true,
    pricePerHour: 30,
    availabilityNote: 'Blocked 2-5 PM',
  },
  {
    id: 'listing_003',
    title: 'HSR Layout Basement',
    location: 'Sector 2, HSR Layout',
    capacity: 6,
    isLive: false,
    pricePerHour: 40,
    availabilityNote: 'Paused',
  },
];

// Bookings
export const seedDashboardBookings: DashboardBooking[] = [
  // Requests (pending approval)
  {
    id: 'booking_001',
    listingId: 'listing_001',
    listingTitle: 'Indiranagar Covered Parking',
    renterName: 'Priya Sharma',
    renterInitials: 'PS',
    start: daysFromNow(0, 14),
    end: daysFromNow(0, 18),
    status: 'request',
    amount: 200,
    vehiclePlate: 'KA 01 AB 1234',
  },
  {
    id: 'booking_002',
    listingId: 'listing_002',
    listingTitle: 'Koramangala Open Space',
    renterName: 'Amit Patel',
    renterInitials: 'AP',
    start: daysFromNow(1, 9),
    end: daysFromNow(1, 17),
    status: 'request',
    amount: 240,
    vehiclePlate: 'KA 05 CD 5678',
  },
  {
    id: 'booking_003',
    listingId: 'listing_001',
    listingTitle: 'Indiranagar Covered Parking',
    renterName: 'Vikram Singh',
    renterInitials: 'VS',
    start: daysFromNow(0, 16),
    end: daysFromNow(0, 20),
    status: 'request',
    amount: 200,
    vehiclePlate: 'KA 03 EF 9012',
  },
  // Active bookings
  {
    id: 'booking_004',
    listingId: 'listing_001',
    listingTitle: 'Indiranagar Covered Parking',
    renterName: 'Neha Gupta',
    renterInitials: 'NG',
    start: daysFromNow(0, 8),
    end: daysFromNow(0, 12),
    status: 'active',
    amount: 200,
    vehiclePlate: 'KA 02 GH 3456',
  },
  {
    id: 'booking_005',
    listingId: 'listing_002',
    listingTitle: 'Koramangala Open Space',
    renterName: 'Rahul Verma',
    renterInitials: 'RV',
    start: daysFromNow(0, 10),
    end: daysFromNow(0, 14),
    status: 'active',
    amount: 120,
    vehiclePlate: 'KA 04 IJ 7890',
  },
  // Upcoming bookings
  {
    id: 'booking_006',
    listingId: 'listing_001',
    listingTitle: 'Indiranagar Covered Parking',
    renterName: 'Sneha Reddy',
    renterInitials: 'SR',
    start: daysFromNow(2, 9),
    end: daysFromNow(2, 18),
    status: 'upcoming',
    amount: 450,
    vehiclePlate: 'AP 09 KL 1234',
  },
  {
    id: 'booking_007',
    listingId: 'listing_002',
    listingTitle: 'Koramangala Open Space',
    renterName: 'Karthik Iyer',
    renterInitials: 'KI',
    start: daysFromNow(3, 8),
    end: daysFromNow(3, 20),
    status: 'upcoming',
    amount: 360,
    vehiclePlate: 'TN 01 MN 5678',
  },
  // Completed bookings (for earnings)
  {
    id: 'booking_008',
    listingId: 'listing_001',
    listingTitle: 'Indiranagar Covered Parking',
    renterName: 'Ananya Das',
    renterInitials: 'AD',
    start: daysAgo(1, 9),
    end: daysAgo(1, 17),
    status: 'completed',
    amount: 400,
    vehiclePlate: 'WB 02 OP 9012',
  },
  {
    id: 'booking_009',
    listingId: 'listing_002',
    listingTitle: 'Koramangala Open Space',
    renterName: 'Suresh Menon',
    renterInitials: 'SM',
    start: daysAgo(2, 10),
    end: daysAgo(2, 16),
    status: 'completed',
    amount: 180,
    vehiclePlate: 'KL 07 QR 3456',
  },
];

// Earnings (last 30 days)
export const seedDashboardEarnings: DashboardEarning[] = [
  { date: daysAgo(0, 10), amount: 200, bookingId: 'booking_004', listingTitle: 'Indiranagar Covered Parking' },
  { date: daysAgo(0, 12), amount: 120, bookingId: 'booking_005', listingTitle: 'Koramangala Open Space' },
  { date: daysAgo(1, 17), amount: 400, bookingId: 'booking_008', listingTitle: 'Indiranagar Covered Parking' },
  { date: daysAgo(2, 16), amount: 180, bookingId: 'booking_009', listingTitle: 'Koramangala Open Space' },
  { date: daysAgo(3, 14), amount: 250, bookingId: 'booking_010', listingTitle: 'Indiranagar Covered Parking' },
  { date: daysAgo(4, 18), amount: 150, bookingId: 'booking_011', listingTitle: 'Koramangala Open Space' },
  { date: daysAgo(5, 12), amount: 300, bookingId: 'booking_012', listingTitle: 'Indiranagar Covered Parking' },
  { date: daysAgo(6, 16), amount: 90, bookingId: 'booking_013', listingTitle: 'Koramangala Open Space' },
  { date: daysAgo(7, 11), amount: 350, bookingId: 'booking_014', listingTitle: 'Indiranagar Covered Parking' },
];

// Notifications
export const seedDashboardNotifications: DashboardNotification[] = [
  {
    id: 'notif_001',
    title: 'New Booking Request',
    message: 'Priya Sharma requested parking at Indiranagar',
    read: false,
    createdAt: daysAgo(0, 1),
    type: 'booking',
  },
  {
    id: 'notif_002',
    title: 'New Booking Request',
    message: 'Amit Patel requested parking at Koramangala',
    read: false,
    createdAt: daysAgo(0, 2),
    type: 'booking',
  },
  {
    id: 'notif_003',
    title: 'Payout Processed',
    message: 'Your weekly payout of ₹1,850 has been initiated',
    read: false,
    createdAt: daysAgo(1, 10),
    type: 'payment',
  },
  {
    id: 'notif_004',
    title: 'New Review',
    message: 'Ananya Das left a 5-star review',
    read: true,
    createdAt: daysAgo(2, 18),
    type: 'review',
  },
  {
    id: 'notif_005',
    title: 'KYC Reminder',
    message: 'Complete your KYC to publish listings',
    read: true,
    createdAt: daysAgo(3, 9),
    type: 'system',
  },
];

// Reviews
export const seedDashboardReviews: DashboardReview[] = [
  {
    id: 'review_001',
    listingId: 'listing_001',
    renterName: 'Ananya Das',
    rating: 5,
    comment: 'Excellent parking spot! Very convenient location and the owner was very responsive.',
    createdAt: daysAgo(2, 18),
  },
  {
    id: 'review_002',
    listingId: 'listing_002',
    renterName: 'Suresh Menon',
    rating: 4,
    comment: 'Good space, easy to find. Could use better lighting at night.',
    createdAt: daysAgo(5, 14),
  },
  {
    id: 'review_003',
    listingId: 'listing_001',
    renterName: 'Vikram Singh',
    rating: 5,
    comment: 'Best parking in the area. Will definitely book again!',
    createdAt: daysAgo(8, 11),
  },
];

// ============================================================================
// LISTINGS SCREEN DATA
// ============================================================================

// Full Listings for My Listings Screen
export const seedFullListings: FullListing[] = [
  {
    id: 'listing_001',
    title: 'Indiranagar Covered Parking',
    locationName: '12th Main Road',
    locationArea: 'Indiranagar',
    locationCity: 'Bangalore',
    status: 'ACTIVE',
    pricePerHour: 50,
    pricePerDay: 400,
    vehicleTypes: ['CAR', 'BIKE'],
    confirmationType: 'INSTANT',
    heightLimit: 2.5,
    capacity: 4,
    amenities: ['CCTV', 'Covered', '24/7 Access', 'Security Guard'],
    updatedAt: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 30, // 30 days ago
    totalEarnings: 12500,
    totalBookings: 45,
    rating: 4.8,
    isVerifiedEligible: true,
  },
  {
    id: 'listing_002',
    title: 'Koramangala Open Space',
    locationName: '80 Feet Road',
    locationArea: 'Koramangala',
    locationCity: 'Bangalore',
    status: 'ACTIVE',
    pricePerHour: 30,
    pricePerDay: 250,
    vehicleTypes: ['CAR', 'BIKE', 'VAN'],
    confirmationType: 'MANUAL',
    capacity: 8,
    amenities: ['Open Air', 'Well Lit', 'Easy Access'],
    updatedAt: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 45, // 45 days ago
    totalEarnings: 8200,
    totalBookings: 68,
    rating: 4.5,
    isVerifiedEligible: true,
  },
  {
    id: 'listing_003',
    title: 'HSR Layout Basement',
    locationName: 'Sector 2',
    locationArea: 'HSR Layout',
    locationCity: 'Bangalore',
    status: 'PAUSED',
    pricePerHour: 40,
    pricePerDay: 300,
    vehicleTypes: ['CAR'],
    confirmationType: 'INSTANT',
    heightLimit: 1.8,
    capacity: 6,
    amenities: ['Underground', 'CCTV', 'Ventilated'],
    updatedAt: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 60, // 60 days ago
    totalEarnings: 6800,
    totalBookings: 32,
    rating: 4.2,
    isVerifiedEligible: true,
  },
  {
    id: 'listing_004',
    title: 'Whitefield Tech Park Spot',
    locationName: 'ITPL Main Road',
    locationArea: 'Whitefield',
    locationCity: 'Bangalore',
    status: 'PENDING',
    pricePerHour: 60,
    pricePerDay: 500,
    vehicleTypes: ['CAR', 'BIKE'],
    confirmationType: 'INSTANT',
    heightLimit: 2.2,
    capacity: 2,
    amenities: ['Covered', 'CCTV', 'Near Metro'],
    updatedAt: Date.now() - 1000 * 60 * 30, // 30 mins ago
    createdAt: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
    totalEarnings: 0,
    totalBookings: 0,
    isVerifiedEligible: false,
  },
  {
    id: 'listing_005',
    title: 'JP Nagar Residential Parking',
    locationName: '15th Cross',
    locationArea: 'JP Nagar',
    locationCity: 'Bangalore',
    status: 'DRAFT',
    pricePerHour: 35,
    vehicleTypes: ['CAR', 'BIKE'],
    confirmationType: 'MANUAL',
    capacity: 3,
    amenities: ['Residential Area', 'Quiet'],
    updatedAt: Date.now() - 1000 * 60 * 60 * 5, // 5 hours ago
    createdAt: Date.now() - 1000 * 60 * 60 * 5, // 5 hours ago
    totalEarnings: 0,
    totalBookings: 0,
    isVerifiedEligible: false,
  },
  {
    id: 'listing_006',
    title: 'MG Road Commercial Complex',
    locationName: 'Brigade Road Junction',
    locationArea: 'MG Road',
    locationCity: 'Bangalore',
    status: 'ACTIVE',
    pricePerHour: 80,
    pricePerDay: 600,
    vehicleTypes: ['CAR'],
    confirmationType: 'INSTANT',
    heightLimit: 2.0,
    capacity: 10,
    amenities: ['Valet Available', 'CCTV', 'Covered', 'EV Charging'],
    updatedAt: Date.now() - 1000 * 60 * 60 * 12, // 12 hours ago
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 90, // 90 days ago
    totalEarnings: 45000,
    totalBookings: 180,
    rating: 4.9,
    isVerifiedEligible: true,
  },
  {
    id: 'listing_007',
    title: 'Electronic City Phase 1',
    locationName: 'Infosys Gate',
    locationArea: 'Electronic City',
    locationCity: 'Bangalore',
    status: 'DRAFT',
    pricePerHour: 25,
    vehicleTypes: ['CAR', 'BIKE', 'VAN', 'TRUCK'],
    confirmationType: 'MANUAL',
    capacity: 20,
    amenities: ['Large Space', 'Truck Friendly'],
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 3, // 3 days ago
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3, // 3 days ago
    totalEarnings: 0,
    totalBookings: 0,
    isVerifiedEligible: false,
  },
  {
    id: 'listing_008',
    title: 'Jayanagar 4th Block',
    locationName: 'Near Cool Joint',
    locationArea: 'Jayanagar',
    locationCity: 'Bangalore',
    status: 'ACTIVE',
    pricePerHour: 45,
    pricePerDay: 350,
    vehicleTypes: ['CAR', 'BIKE'],
    confirmationType: 'INSTANT',
    capacity: 5,
    amenities: ['CCTV', 'Well Lit', 'Market Area'],
    updatedAt: Date.now() - 1000 * 60 * 60 * 6, // 6 hours ago
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 15, // 15 days ago
    totalEarnings: 3200,
    totalBookings: 22,
    rating: 4.6,
    isVerifiedEligible: true,
  },
];

// Default UI State for Listings Screen
export const defaultListingsUIState: ListingsUIState = {
  searchText: '',
  statusFilter: 'all',
  vehicleFilters: [],
  sortOption: 'newest',
};

// ============================================================================
// BOOKINGS SCREEN DATA
// ============================================================================

// Helper to create ISO date strings relative to now
const now = new Date();
const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
const daysFromNowISO = (days: number, hour = 10) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const daysAgoISO = (days: number, hour = 10) => {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

// Indian vehicle plates
const vehiclePlates = [
  'KA 01 AB 1234', 'KA 05 CD 5678', 'KA 03 EF 9012', 'MH 12 GH 3456',
  'DL 01 IJ 7890', 'TN 09 KL 2345', 'AP 28 MN 6789', 'KA 02 OP 1357',
  'MH 04 QR 2468', 'KA 51 ST 3579', 'TN 01 UV 4680', 'DL 05 WX 5791',
  'KA 09 YZ 6802', 'MH 01 AA 7913', 'AP 09 BB 8024', 'KA 41 CC 9135',
];

// Indian names
const renterNames = [
  'Priya Sharma', 'Amit Patel', 'Sneha Reddy', 'Vikram Singh', 'Ananya Das',
  'Rahul Verma', 'Neha Gupta', 'Karthik Iyer', 'Pooja Nair', 'Arjun Mehta',
  'Divya Krishnan', 'Suresh Menon', 'Lakshmi Rao', 'Rajesh Kumar', 'Meera Joshi',
  'Anil Kapoor', 'Sunita Devi', 'Manoj Tiwari', 'Kavitha Pillai', 'Sanjay Bhat',
];

// Full Bookings for Bookings Screen
export const seedFullBookings: FullBooking[] = [
  // REQUESTED bookings (5)
  {
    id: 'booking_req_001',
    status: 'REQUESTED',
    listingId: 'listing_001',
    listingName: 'Indiranagar Covered Parking - Slot A1',
    addressLine: '12th Main Road, Indiranagar, Bangalore',
    startAt: daysFromNowISO(0, 14),
    endAt: daysFromNowISO(0, 18),
    vehicle: { type: 'CAR', plate: 'KA 01 AB 1234' },
    renterName: 'Priya Sharma',
    renterPhone: '+91 98765 43210',
    priceTotal: 200,
    currency: 'INR',
    createdAt: hoursAgo(1),
    flags: { verified: true },
  },
  {
    id: 'booking_req_002',
    status: 'REQUESTED',
    listingId: 'listing_002',
    listingName: 'Koramangala Open Space - Slot B3',
    addressLine: '80 Feet Road, Koramangala, Bangalore',
    startAt: daysFromNowISO(1, 9),
    endAt: daysFromNowISO(1, 17),
    vehicle: { type: 'CAR', plate: 'KA 05 CD 5678' },
    renterName: 'Amit Patel',
    renterPhone: '+91 98765 43211',
    priceTotal: 240,
    currency: 'INR',
    createdAt: hoursAgo(2),
    flags: { peakPricingApplied: true },
  },
  {
    id: 'booking_req_003',
    status: 'REQUESTED',
    listingId: 'listing_001',
    listingName: 'Indiranagar Covered Parking - Slot A2',
    addressLine: '12th Main Road, Indiranagar, Bangalore',
    startAt: daysFromNowISO(0, 16),
    endAt: daysFromNowISO(0, 20),
    vehicle: { type: 'BIKE', plate: 'KA 03 EF 9012' },
    renterName: 'Vikram Singh',
    renterPhone: '+91 98765 43212',
    priceTotal: 80,
    currency: 'INR',
    createdAt: hoursAgo(3),
    flags: {},
  },
  {
    id: 'booking_req_004',
    status: 'REQUESTED',
    listingId: 'listing_006',
    listingName: 'MG Road Commercial Complex - Slot C5',
    addressLine: 'Brigade Road Junction, MG Road, Bangalore',
    startAt: daysFromNowISO(2, 10),
    endAt: daysFromNowISO(2, 18),
    vehicle: { type: 'CAR', plate: 'MH 12 GH 3456' },
    renterName: 'Sneha Reddy',
    renterPhone: '+91 98765 43213',
    priceTotal: 640,
    currency: 'INR',
    createdAt: hoursAgo(4),
    flags: { verified: true, requiresPermit: true },
  },
  {
    id: 'booking_req_005',
    status: 'REQUESTED',
    listingId: 'listing_008',
    listingName: 'Jayanagar 4th Block - Slot D2',
    addressLine: 'Near Cool Joint, Jayanagar, Bangalore',
    startAt: daysFromNowISO(1, 11),
    endAt: daysFromNowISO(1, 15),
    vehicle: { type: 'VAN', plate: 'DL 01 IJ 7890' },
    renterName: 'Rahul Verma',
    renterPhone: '+91 98765 43214',
    priceTotal: 180,
    currency: 'INR',
    createdAt: hoursAgo(5),
    flags: { peakPricingApplied: true },
  },

  // UPCOMING bookings (5)
  {
    id: 'booking_up_001',
    status: 'UPCOMING',
    listingId: 'listing_001',
    listingName: 'Indiranagar Covered Parking - Slot A3',
    addressLine: '12th Main Road, Indiranagar, Bangalore',
    startAt: daysFromNowISO(2, 9),
    endAt: daysFromNowISO(2, 18),
    vehicle: { type: 'CAR', plate: 'TN 09 KL 2345' },
    renterName: 'Neha Gupta',
    renterPhone: '+91 98765 43215',
    priceTotal: 450,
    currency: 'INR',
    createdAt: daysAgoISO(1),
    flags: { verified: true },
  },
  {
    id: 'booking_up_002',
    status: 'UPCOMING',
    listingId: 'listing_002',
    listingName: 'Koramangala Open Space - Slot B1',
    addressLine: '80 Feet Road, Koramangala, Bangalore',
    startAt: daysFromNowISO(3, 8),
    endAt: daysFromNowISO(3, 20),
    vehicle: { type: 'TRUCK', plate: 'AP 28 MN 6789' },
    renterName: 'Karthik Iyer',
    renterPhone: '+91 98765 43216',
    priceTotal: 360,
    currency: 'INR',
    createdAt: daysAgoISO(2),
    flags: { requiresPermit: true },
  },
  {
    id: 'booking_up_003',
    status: 'UPCOMING',
    listingId: 'listing_006',
    listingName: 'MG Road Commercial Complex - Slot C1',
    addressLine: 'Brigade Road Junction, MG Road, Bangalore',
    startAt: daysFromNowISO(1, 7),
    endAt: daysFromNowISO(1, 19),
    vehicle: { type: 'CAR', plate: 'KA 02 OP 1357' },
    renterName: 'Pooja Nair',
    renterPhone: '+91 98765 43217',
    priceTotal: 960,
    currency: 'INR',
    createdAt: daysAgoISO(1),
    flags: { verified: true, peakPricingApplied: true },
  },
  {
    id: 'booking_up_004',
    status: 'UPCOMING',
    listingId: 'listing_008',
    listingName: 'Jayanagar 4th Block - Slot D1',
    addressLine: 'Near Cool Joint, Jayanagar, Bangalore',
    startAt: daysFromNowISO(4, 10),
    endAt: daysFromNowISO(4, 16),
    vehicle: { type: 'BIKE', plate: 'MH 04 QR 2468' },
    renterName: 'Arjun Mehta',
    renterPhone: '+91 98765 43218',
    priceTotal: 120,
    currency: 'INR',
    createdAt: daysAgoISO(3),
    flags: {},
  },
  {
    id: 'booking_up_005',
    status: 'UPCOMING',
    listingId: 'listing_001',
    listingName: 'Indiranagar Covered Parking - Slot A4',
    addressLine: '12th Main Road, Indiranagar, Bangalore',
    startAt: daysFromNowISO(5, 8),
    endAt: daysFromNowISO(5, 20),
    vehicle: { type: 'CAR', plate: 'KA 51 ST 3579' },
    renterName: 'Divya Krishnan',
    renterPhone: '+91 98765 43219',
    priceTotal: 600,
    currency: 'INR',
    createdAt: daysAgoISO(2),
    flags: { verified: true },
  },

  // ACTIVE bookings (4)
  {
    id: 'booking_act_001',
    status: 'ACTIVE',
    listingId: 'listing_001',
    listingName: 'Indiranagar Covered Parking - Slot A1',
    addressLine: '12th Main Road, Indiranagar, Bangalore',
    startAt: hoursAgo(2),
    endAt: hoursFromNow(4),
    vehicle: { type: 'CAR', plate: 'TN 01 UV 4680' },
    renterName: 'Suresh Menon',
    renterPhone: '+91 98765 43220',
    priceTotal: 300,
    currency: 'INR',
    createdAt: daysAgoISO(1),
    flags: { verified: true },
  },
  {
    id: 'booking_act_002',
    status: 'ACTIVE',
    listingId: 'listing_002',
    listingName: 'Koramangala Open Space - Slot B2',
    addressLine: '80 Feet Road, Koramangala, Bangalore',
    startAt: hoursAgo(3),
    endAt: hoursFromNow(2),
    vehicle: { type: 'CAR', plate: 'DL 05 WX 5791' },
    renterName: 'Lakshmi Rao',
    renterPhone: '+91 98765 43221',
    priceTotal: 150,
    currency: 'INR',
    createdAt: daysAgoISO(1),
    flags: { peakPricingApplied: true },
  },
  {
    id: 'booking_act_003',
    status: 'ACTIVE',
    listingId: 'listing_006',
    listingName: 'MG Road Commercial Complex - Slot C3',
    addressLine: 'Brigade Road Junction, MG Road, Bangalore',
    startAt: hoursAgo(1),
    endAt: hoursFromNow(5),
    vehicle: { type: 'BIKE', plate: 'KA 09 YZ 6802' },
    renterName: 'Rajesh Kumar',
    renterPhone: '+91 98765 43222',
    priceTotal: 240,
    currency: 'INR',
    createdAt: daysAgoISO(0),
    flags: {},
  },
  {
    id: 'booking_act_004',
    status: 'ACTIVE',
    listingId: 'listing_008',
    listingName: 'Jayanagar 4th Block - Slot D3',
    addressLine: 'Near Cool Joint, Jayanagar, Bangalore',
    startAt: hoursAgo(4),
    endAt: hoursFromNow(1),
    vehicle: { type: 'VAN', plate: 'MH 01 AA 7913' },
    renterName: 'Meera Joshi',
    renterPhone: '+91 98765 43223',
    priceTotal: 225,
    currency: 'INR',
    createdAt: daysAgoISO(1),
    flags: { verified: true, requiresPermit: true },
  },

  // COMPLETED bookings (8)
  {
    id: 'booking_comp_001',
    status: 'COMPLETED',
    listingId: 'listing_001',
    listingName: 'Indiranagar Covered Parking - Slot A2',
    addressLine: '12th Main Road, Indiranagar, Bangalore',
    startAt: daysAgoISO(1, 9),
    endAt: daysAgoISO(1, 17),
    vehicle: { type: 'CAR', plate: 'AP 09 BB 8024' },
    renterName: 'Anil Kapoor',
    renterPhone: '+91 98765 43224',
    priceTotal: 400,
    currency: 'INR',
    createdAt: daysAgoISO(3),
    flags: { verified: true },
  },
  {
    id: 'booking_comp_002',
    status: 'COMPLETED',
    listingId: 'listing_002',
    listingName: 'Koramangala Open Space - Slot B4',
    addressLine: '80 Feet Road, Koramangala, Bangalore',
    startAt: daysAgoISO(2, 10),
    endAt: daysAgoISO(2, 16),
    vehicle: { type: 'BIKE', plate: 'KA 41 CC 9135' },
    renterName: 'Sunita Devi',
    renterPhone: '+91 98765 43225',
    priceTotal: 90,
    currency: 'INR',
    createdAt: daysAgoISO(4),
    flags: {},
  },
  {
    id: 'booking_comp_003',
    status: 'COMPLETED',
    listingId: 'listing_006',
    listingName: 'MG Road Commercial Complex - Slot C2',
    addressLine: 'Brigade Road Junction, MG Road, Bangalore',
    startAt: daysAgoISO(3, 8),
    endAt: daysAgoISO(3, 20),
    vehicle: { type: 'CAR', plate: 'KA 01 AB 1234' },
    renterName: 'Manoj Tiwari',
    renterPhone: '+91 98765 43226',
    priceTotal: 960,
    currency: 'INR',
    createdAt: daysAgoISO(5),
    flags: { verified: true, peakPricingApplied: true },
  },
  {
    id: 'booking_comp_004',
    status: 'COMPLETED',
    listingId: 'listing_008',
    listingName: 'Jayanagar 4th Block - Slot D4',
    addressLine: 'Near Cool Joint, Jayanagar, Bangalore',
    startAt: daysAgoISO(4, 11),
    endAt: daysAgoISO(4, 19),
    vehicle: { type: 'TRUCK', plate: 'TN 09 KL 2345' },
    renterName: 'Kavitha Pillai',
    renterPhone: '+91 98765 43227',
    priceTotal: 360,
    currency: 'INR',
    createdAt: daysAgoISO(6),
    flags: { requiresPermit: true },
  },
  {
    id: 'booking_comp_005',
    status: 'COMPLETED',
    listingId: 'listing_001',
    listingName: 'Indiranagar Covered Parking - Slot A3',
    addressLine: '12th Main Road, Indiranagar, Bangalore',
    startAt: daysAgoISO(5, 9),
    endAt: daysAgoISO(5, 13),
    vehicle: { type: 'CAR', plate: 'MH 12 GH 3456' },
    renterName: 'Sanjay Bhat',
    renterPhone: '+91 98765 43228',
    priceTotal: 200,
    currency: 'INR',
    createdAt: daysAgoISO(7),
    flags: { verified: true },
  },
  {
    id: 'booking_comp_006',
    status: 'COMPLETED',
    listingId: 'listing_002',
    listingName: 'Koramangala Open Space - Slot B5',
    addressLine: '80 Feet Road, Koramangala, Bangalore',
    startAt: daysAgoISO(6, 7),
    endAt: daysAgoISO(6, 19),
    vehicle: { type: 'VAN', plate: 'DL 01 IJ 7890' },
    renterName: 'Priya Sharma',
    renterPhone: '+91 98765 43210',
    priceTotal: 360,
    currency: 'INR',
    createdAt: daysAgoISO(8),
    flags: { peakPricingApplied: true },
  },
  {
    id: 'booking_comp_007',
    status: 'COMPLETED',
    listingId: 'listing_006',
    listingName: 'MG Road Commercial Complex - Slot C4',
    addressLine: 'Brigade Road Junction, MG Road, Bangalore',
    startAt: daysAgoISO(7, 10),
    endAt: daysAgoISO(7, 18),
    vehicle: { type: 'CAR', plate: 'AP 28 MN 6789' },
    renterName: 'Amit Patel',
    renterPhone: '+91 98765 43211',
    priceTotal: 640,
    currency: 'INR',
    createdAt: daysAgoISO(9),
    flags: { verified: true },
  },
  {
    id: 'booking_comp_008',
    status: 'COMPLETED',
    listingId: 'listing_008',
    listingName: 'Jayanagar 4th Block - Slot D5',
    addressLine: 'Near Cool Joint, Jayanagar, Bangalore',
    startAt: daysAgoISO(8, 12),
    endAt: daysAgoISO(8, 16),
    vehicle: { type: 'BIKE', plate: 'KA 02 OP 1357' },
    renterName: 'Sneha Reddy',
    renterPhone: '+91 98765 43213',
    priceTotal: 90,
    currency: 'INR',
    createdAt: daysAgoISO(10),
    flags: {},
  },

  // CANCELLED bookings (3)
  {
    id: 'booking_canc_001',
    status: 'CANCELLED',
    listingId: 'listing_001',
    listingName: 'Indiranagar Covered Parking - Slot A4',
    addressLine: '12th Main Road, Indiranagar, Bangalore',
    startAt: daysAgoISO(2, 14),
    endAt: daysAgoISO(2, 18),
    vehicle: { type: 'CAR', plate: 'MH 04 QR 2468' },
    renterName: 'Vikram Singh',
    renterPhone: '+91 98765 43212',
    priceTotal: 200,
    currency: 'INR',
    createdAt: daysAgoISO(4),
    flags: {},
    notes: 'Cancelled by renter',
  },
  {
    id: 'booking_canc_002',
    status: 'CANCELLED',
    listingId: 'listing_006',
    listingName: 'MG Road Commercial Complex - Slot C6',
    addressLine: 'Brigade Road Junction, MG Road, Bangalore',
    startAt: daysAgoISO(5, 9),
    endAt: daysAgoISO(5, 17),
    vehicle: { type: 'TRUCK', plate: 'KA 51 ST 3579' },
    renterName: 'Rahul Verma',
    renterPhone: '+91 98765 43214',
    priceTotal: 640,
    currency: 'INR',
    createdAt: daysAgoISO(7),
    flags: { requiresPermit: true },
    notes: 'Vehicle too large',
  },
  {
    id: 'booking_canc_003',
    status: 'CANCELLED',
    listingId: 'listing_002',
    listingName: 'Koramangala Open Space - Slot B6',
    addressLine: '80 Feet Road, Koramangala, Bangalore',
    startAt: daysAgoISO(3, 10),
    endAt: daysAgoISO(3, 14),
    vehicle: { type: 'CAR', plate: 'TN 01 UV 4680' },
    renterName: 'Neha Gupta',
    renterPhone: '+91 98765 43215',
    priceTotal: 120,
    currency: 'INR',
    createdAt: daysAgoISO(5),
    flags: { verified: true },
    notes: 'Owner unavailable',
  },

  // NO_SHOW bookings (2)
  {
    id: 'booking_noshow_001',
    status: 'NO_SHOW',
    listingId: 'listing_001',
    listingName: 'Indiranagar Covered Parking - Slot A1',
    addressLine: '12th Main Road, Indiranagar, Bangalore',
    startAt: daysAgoISO(1, 10),
    endAt: daysAgoISO(1, 14),
    vehicle: { type: 'CAR', plate: 'DL 05 WX 5791' },
    renterName: 'Karthik Iyer',
    renterPhone: '+91 98765 43216',
    priceTotal: 200,
    currency: 'INR',
    createdAt: daysAgoISO(3),
    flags: {},
    notes: 'Renter did not arrive',
  },
  {
    id: 'booking_noshow_002',
    status: 'NO_SHOW',
    listingId: 'listing_008',
    listingName: 'Jayanagar 4th Block - Slot D1',
    addressLine: 'Near Cool Joint, Jayanagar, Bangalore',
    startAt: daysAgoISO(4, 15),
    endAt: daysAgoISO(4, 19),
    vehicle: { type: 'BIKE', plate: 'KA 09 YZ 6802' },
    renterName: 'Pooja Nair',
    renterPhone: '+91 98765 43217',
    priceTotal: 90,
    currency: 'INR',
    createdAt: daysAgoISO(6),
    flags: { verified: true },
    notes: 'No contact from renter',
  },
];

// Default UI State for Bookings Screen
export const defaultBookingsUIState: BookingsUIState = {
  selectedTab: 'requests',
  searchText: '',
  vehicleFilter: 'all',
  statusFilter: 'all',
  dateRange: 'all',
  sortOption: 'newest',
};

// ============================================================================
// LEGACY EXPORTS (for compatibility)
// ============================================================================

export const mockListings: Listing[] = [
  {
    id: '1',
    title: 'Downtown Parking Spot',
    address: '123 Main Street, City Center',
    price: 10,
    priceUnit: 'hour',
    status: 'active',
    imageUrl: 'https://placeholder.com/parking1.jpg',
    rating: 4.5,
    totalBookings: 45,
  },
  {
    id: '2',
    title: 'Airport Adjacent Parking',
    address: '456 Airport Road',
    price: 25,
    priceUnit: 'day',
    status: 'active',
    imageUrl: 'https://placeholder.com/parking2.jpg',
    rating: 4.8,
    totalBookings: 120,
  },
];

export const mockBookings: Booking[] = [
  {
    id: '1',
    listingId: '1',
    listingTitle: 'Downtown Parking Spot',
    driverName: 'John Doe',
    driverPhone: '+1234567890',
    vehiclePlate: 'ABC-1234',
    startTime: '2024-01-15T09:00:00Z',
    endTime: '2024-01-15T17:00:00Z',
    status: 'confirmed',
    totalAmount: 80,
  },
  {
    id: '2',
    listingId: '2',
    listingTitle: 'Airport Adjacent Parking',
    driverName: 'Jane Smith',
    driverPhone: '+0987654321',
    vehiclePlate: 'XYZ-5678',
    startTime: '2024-01-16T06:00:00Z',
    endTime: '2024-01-18T18:00:00Z',
    status: 'pending',
    totalAmount: 75,
  },
];

export const mockNotifications: Notification[] = [
  {
    id: '1',
    title: 'New Booking Request',
    message: 'You have a new booking request for Downtown Parking Spot',
    type: 'booking',
    isRead: false,
    createdAt: '2024-01-15T08:30:00Z',
  },
  {
    id: '2',
    title: 'Payout Processed',
    message: 'Your payout of $250 has been processed',
    type: 'payment',
    isRead: true,
    createdAt: '2024-01-14T15:00:00Z',
  },
];

export const mockUser: User = {
  id: '1',
  name: 'Owner Name',
  email: 'owner@example.com',
  phone: '+1234567890',
  avatarUrl: 'https://placeholder.com/avatar.jpg',
  kycStatus: 'approved',
  bankAccountLinked: true,
};

// Profile Setup Options
export const indianStates = [
  { value: 'AN', label: 'Andaman and Nicobar Islands' },
  { value: 'AP', label: 'Andhra Pradesh' },
  { value: 'AR', label: 'Arunachal Pradesh' },
  { value: 'AS', label: 'Assam' },
  { value: 'BR', label: 'Bihar' },
  { value: 'CH', label: 'Chandigarh' },
  { value: 'CT', label: 'Chhattisgarh' },
  { value: 'DL', label: 'Delhi' },
  { value: 'GA', label: 'Goa' },
  { value: 'GJ', label: 'Gujarat' },
  { value: 'HR', label: 'Haryana' },
  { value: 'HP', label: 'Himachal Pradesh' },
  { value: 'JK', label: 'Jammu and Kashmir' },
  { value: 'JH', label: 'Jharkhand' },
  { value: 'KA', label: 'Karnataka' },
  { value: 'KL', label: 'Kerala' },
  { value: 'MP', label: 'Madhya Pradesh' },
  { value: 'MH', label: 'Maharashtra' },
  { value: 'MN', label: 'Manipur' },
  { value: 'ML', label: 'Meghalaya' },
  { value: 'MZ', label: 'Mizoram' },
  { value: 'NL', label: 'Nagaland' },
  { value: 'OR', label: 'Odisha' },
  { value: 'PB', label: 'Punjab' },
  { value: 'RJ', label: 'Rajasthan' },
  { value: 'SK', label: 'Sikkim' },
  { value: 'TN', label: 'Tamil Nadu' },
  { value: 'TG', label: 'Telangana' },
  { value: 'TR', label: 'Tripura' },
  { value: 'UP', label: 'Uttar Pradesh' },
  { value: 'UT', label: 'Uttarakhand' },
  { value: 'WB', label: 'West Bengal' },
];

export const languages = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'bn', label: 'Bengali' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'pa', label: 'Punjabi' },
];

export const countries = [
  { value: 'IN', label: 'India' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'SG', label: 'Singapore' },
];

export const ownerTypeLabels: Record<string, string> = {
  individual: 'Individual Owner',
  residential_community: 'Residential Community',
  commercial_property: 'Commercial Property',
  industrial_facility: 'Industrial Facility',
  empty_land: 'Empty Land Owner',
  // Fallback labels for backend-only types not exposed in the picker.
  business: 'Business',
  property_manager: 'Property Manager',
};

// ============================================================================
// EARNINGS SCREEN DATA
// ============================================================================

import type {
  EarningsTransaction,
  EarningsUIState,
  TransactionStatus,
  PayoutStatus,
  TransactionType,
} from '../types/models';

// Listing names for transactions
const earningsListings = [
  { id: 'listing_001', name: 'Indiranagar Covered Parking' },
  { id: 'listing_002', name: 'Koramangala Open Space' },
  { id: 'listing_003', name: 'HSR Layout Basement' },
  { id: 'listing_006', name: 'MG Road Commercial Complex' },
  { id: 'listing_008', name: 'Jayanagar 4th Block' },
  { id: 'listing_004', name: 'Whitefield Tech Park Spot' },
];

// Generate booking reference
const generateBookingRef = (index: number): string => {
  const prefix = 'BK';
  const num = String(index).padStart(6, '0');
  return `${prefix}${num}`;
};

// Generate transaction date
const transactionDate = (daysAgo: number, hour = 12): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return d.toISOString();
};

// Generate 60+ transactions spanning 3 months
const generateEarningsTransactions = (): EarningsTransaction[] => {
  const transactions: EarningsTransaction[] = [];
  let txIndex = 1;

  // Today's transactions (3)
  transactions.push({
    id: `txn_${String(txIndex++).padStart(4, '0')}`,
    createdAt: transactionDate(0, 9),
    amount: 200,
    currency: 'INR',
    status: 'completed',
    payoutStatus: 'unpaid',
    type: 'booking',
    listingId: 'listing_001',
    listingName: 'Indiranagar Covered Parking',
    bookingRef: generateBookingRef(txIndex),
    renterName: 'Priya Sharma',
  });

  transactions.push({
    id: `txn_${String(txIndex++).padStart(4, '0')}`,
    createdAt: transactionDate(0, 11),
    amount: 150,
    currency: 'INR',
    status: 'pending',
    payoutStatus: 'unpaid',
    type: 'booking',
    listingId: 'listing_002',
    listingName: 'Koramangala Open Space',
    bookingRef: generateBookingRef(txIndex),
    renterName: 'Amit Patel',
  });

  transactions.push({
    id: `txn_${String(txIndex++).padStart(4, '0')}`,
    createdAt: transactionDate(0, 14),
    amount: 80,
    currency: 'INR',
    status: 'completed',
    payoutStatus: 'unpaid',
    type: 'extension',
    listingId: 'listing_001',
    listingName: 'Indiranagar Covered Parking',
    bookingRef: generateBookingRef(1),
    renterName: 'Priya Sharma',
    note: 'Extended parking by 2 hours',
  });

  // Yesterday's transactions (4)
  transactions.push({
    id: `txn_${String(txIndex++).padStart(4, '0')}`,
    createdAt: transactionDate(1, 8),
    amount: 400,
    currency: 'INR',
    status: 'completed',
    payoutStatus: 'unpaid',
    type: 'booking',
    listingId: 'listing_006',
    listingName: 'MG Road Commercial Complex',
    bookingRef: generateBookingRef(txIndex),
    renterName: 'Vikram Singh',
  });

  transactions.push({
    id: `txn_${String(txIndex++).padStart(4, '0')}`,
    createdAt: transactionDate(1, 10),
    amount: 90,
    currency: 'INR',
    status: 'completed',
    payoutStatus: 'unpaid',
    type: 'booking',
    listingId: 'listing_008',
    listingName: 'Jayanagar 4th Block',
    bookingRef: generateBookingRef(txIndex),
    renterName: 'Neha Gupta',
  });

  transactions.push({
    id: `txn_${String(txIndex++).padStart(4, '0')}`,
    createdAt: transactionDate(1, 15),
    amount: -50,
    currency: 'INR',
    status: 'refunded',
    payoutStatus: 'paid',
    type: 'refund',
    listingId: 'listing_002',
    listingName: 'Koramangala Open Space',
    bookingRef: generateBookingRef(txIndex - 3),
    renterName: 'Rahul Verma',
    note: 'Early checkout refund',
  });

  transactions.push({
    id: `txn_${String(txIndex++).padStart(4, '0')}`,
    createdAt: transactionDate(1, 18),
    amount: 240,
    currency: 'INR',
    status: 'completed',
    payoutStatus: 'unpaid',
    type: 'booking',
    listingId: 'listing_002',
    listingName: 'Koramangala Open Space',
    bookingRef: generateBookingRef(txIndex),
    renterName: 'Sneha Reddy',
  });

  // This week (days 2-7) - 12 transactions
  for (let day = 2; day <= 7; day++) {
    const numTxns = day % 2 === 0 ? 2 : 3;
    for (let i = 0; i < numTxns; i++) {
      const listing = earningsListings[Math.floor(Math.random() * earningsListings.length)];
      const amounts = [90, 120, 150, 200, 240, 300, 400, 500, 640, 800];
      const amount = amounts[Math.floor(Math.random() * amounts.length)];
      const statuses: TransactionStatus[] = ['completed', 'completed', 'completed', 'pending'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const payoutStatuses: PayoutStatus[] = status === 'completed' ? ['paid', 'unpaid', 'processing'] : ['unpaid'];
      const payoutStatus = payoutStatuses[Math.floor(Math.random() * payoutStatuses.length)];

      transactions.push({
        id: `txn_${String(txIndex++).padStart(4, '0')}`,
        createdAt: transactionDate(day, 8 + i * 4),
        amount,
        currency: 'INR',
        status,
        payoutStatus,
        type: 'booking',
        listingId: listing.id,
        listingName: listing.name,
        bookingRef: generateBookingRef(txIndex),
        renterName: renterNames[Math.floor(Math.random() * renterNames.length)],
      });
    }
  }

  // This month (days 8-30) - 25 transactions
  for (let day = 8; day <= 30; day += 1) {
    if (Math.random() > 0.3) { // 70% chance of transaction each day
      const listing = earningsListings[Math.floor(Math.random() * earningsListings.length)];
      const amounts = [90, 120, 150, 200, 240, 300, 400, 500];
      const amount = amounts[Math.floor(Math.random() * amounts.length)];

      transactions.push({
        id: `txn_${String(txIndex++).padStart(4, '0')}`,
        createdAt: transactionDate(day, 10 + Math.floor(Math.random() * 8)),
        amount,
        currency: 'INR',
        status: 'completed',
        payoutStatus: day > 20 ? 'paid' : 'unpaid',
        type: 'booking',
        listingId: listing.id,
        listingName: listing.name,
        bookingRef: generateBookingRef(txIndex),
        renterName: renterNames[Math.floor(Math.random() * renterNames.length)],
      });
    }
  }

  // Older transactions (days 31-90) - 20 transactions
  for (let day = 31; day <= 90; day += 3) {
    const listing = earningsListings[Math.floor(Math.random() * earningsListings.length)];
    const amounts = [90, 150, 200, 300, 400];
    const amount = amounts[Math.floor(Math.random() * amounts.length)];

    transactions.push({
      id: `txn_${String(txIndex++).padStart(4, '0')}`,
      createdAt: transactionDate(day, 12),
      amount,
      currency: 'INR',
      status: 'completed',
      payoutStatus: 'paid',
      type: 'booking',
      listingId: listing.id,
      listingName: listing.name,
      bookingRef: generateBookingRef(txIndex),
      renterName: renterNames[Math.floor(Math.random() * renterNames.length)],
    });
  }

  // Add some special transactions
  // Cancellation fees (3)
  transactions.push({
    id: `txn_${String(txIndex++).padStart(4, '0')}`,
    createdAt: transactionDate(3, 16),
    amount: 50,
    currency: 'INR',
    status: 'completed',
    payoutStatus: 'unpaid',
    type: 'cancellation_fee',
    listingId: 'listing_001',
    listingName: 'Indiranagar Covered Parking',
    bookingRef: generateBookingRef(txIndex),
    renterName: 'Karthik Iyer',
    note: 'Late cancellation fee (50%)',
  });

  transactions.push({
    id: `txn_${String(txIndex++).padStart(4, '0')}`,
    createdAt: transactionDate(12, 9),
    amount: 100,
    currency: 'INR',
    status: 'completed',
    payoutStatus: 'paid',
    type: 'cancellation_fee',
    listingId: 'listing_006',
    listingName: 'MG Road Commercial Complex',
    bookingRef: generateBookingRef(txIndex),
    renterName: 'Pooja Nair',
    note: 'No-show cancellation fee',
  });

  // Adjustments (2)
  transactions.push({
    id: `txn_${String(txIndex++).padStart(4, '0')}`,
    createdAt: transactionDate(5, 14),
    amount: 30,
    currency: 'INR',
    status: 'completed',
    payoutStatus: 'unpaid',
    type: 'adjustment',
    listingId: 'listing_002',
    listingName: 'Koramangala Open Space',
    note: 'Overtime charge adjustment',
  });

  transactions.push({
    id: `txn_${String(txIndex++).padStart(4, '0')}`,
    createdAt: transactionDate(15, 11),
    amount: -25,
    currency: 'INR',
    status: 'completed',
    payoutStatus: 'paid',
    type: 'adjustment',
    listingId: 'listing_008',
    listingName: 'Jayanagar 4th Block',
    note: 'Goodwill credit for inconvenience',
  });

  // Failed transaction (1)
  transactions.push({
    id: `txn_${String(txIndex++).padStart(4, '0')}`,
    createdAt: transactionDate(2, 17),
    amount: 200,
    currency: 'INR',
    status: 'failed',
    payoutStatus: 'unpaid',
    type: 'booking',
    listingId: 'listing_001',
    listingName: 'Indiranagar Covered Parking',
    bookingRef: generateBookingRef(txIndex),
    renterName: 'Arjun Mehta',
    note: 'Payment failed - card declined',
  });

  // More refunds (2)
  transactions.push({
    id: `txn_${String(txIndex++).padStart(4, '0')}`,
    createdAt: transactionDate(8, 13),
    amount: -120,
    currency: 'INR',
    status: 'refunded',
    payoutStatus: 'paid',
    type: 'refund',
    listingId: 'listing_002',
    listingName: 'Koramangala Open Space',
    bookingRef: generateBookingRef(txIndex - 10),
    renterName: 'Divya Krishnan',
    note: 'Full refund - booking cancelled by owner',
  });

  transactions.push({
    id: `txn_${String(txIndex++).padStart(4, '0')}`,
    createdAt: transactionDate(20, 10),
    amount: -75,
    currency: 'INR',
    status: 'refunded',
    payoutStatus: 'paid',
    type: 'refund',
    listingId: 'listing_008',
    listingName: 'Jayanagar 4th Block',
    bookingRef: generateBookingRef(txIndex - 15),
    renterName: 'Suresh Menon',
    note: 'Partial refund - spot unavailable',
  });

  // Sort by date (newest first)
  transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return transactions;
};

// Seed earnings transactions
export const seedEarningsTransactions: EarningsTransaction[] = generateEarningsTransactions();

// Default UI state for Earnings Screen
export const defaultEarningsUIState: EarningsUIState = {
  selectedRange: 'month',
  viewMode: 'overview',
  filters: {
    status: [],
    payoutStatus: [],
    types: [],
    listingIds: [],
  },
  searchText: '',
  sortOption: 'newest',
};

// Listing options for filter
export const earningsListingOptions = earningsListings;
