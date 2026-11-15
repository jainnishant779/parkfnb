/** Standardized API response types matching backend format */

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  http: number;
  message: string;
  details?: any;
  traceId: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiError;
}

// Auth types
export interface OtpSendResponse {
  message: string;
  channel: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: AuthUser;
  owner: AuthOwner | null;
  token: string;
  isNewUser: boolean;
}

export interface AuthUser {
  id: string;
  email?: string;
  phone?: string;
  firstName: string;
  lastName: string;
  legalName?: string;
  profilePictureUrl?: string;
  userType: 'user' | 'owner' | 'admin';
  authMethod: 'password' | 'otp';
  onboardingStep: 'auth_complete' | 'profile_setup' | 'kyc_submitted' | 'completed';
  isVerified: boolean;
  // Profile fields
  alternatePhone?: string;
  dateOfBirth?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  landmark?: string;
  locationLat?: number;
  locationLng?: number;
  preferredLanguage?: string;
  notificationBooking?: boolean;
  notificationPayout?: boolean;
  notificationPromotion?: boolean;
  timeFormat?: '12h' | '24h';
  createdAt: string;
  updatedAt: string;
}

export interface AuthOwner {
  id: string;
  userId: string;
  ownerType: string;
  businessName?: string;
  roleDesignation?: string;
  registrationId?: string;
  landLabel?: string;
  isVerified: boolean;
  kycStatus: 'not_started' | 'draft' | 'submitted' | 'verified' | 'rejected';
  kycRejectionReason?: string;
  kycPersonal?: any;
  kycIdentity?: any;
  kycAddress?: any;
  kycBank?: any;
  createdAt: string;
}

export interface OnboardingStatus {
  onboardingStep: string;
  kycStatus: string;
  isOnboardingComplete: boolean;
  nextScreen: string;
}

export interface ProfileResponse {
  user: AuthUser;
  owner: AuthOwner;
}

export interface KycResponse {
  owner: AuthOwner;
  message: string;
}

export interface UploadResponse {
  url: string;
  publicId: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  resourceType: string;
  filename: string;
  mimeType: string;
}

// ============================================================================
// Listing types (Property + ParkingSpace + Availability)
// ============================================================================

// Backend's MongoDB _id comes through the case-transform interceptor as an `id`
// via explicit mapping in services, or as `_id` (camelCase passthrough for
// leading underscore). We handle both shapes via normalizers in services.

export interface ApiProperty {
  id: string;
  ownerId: string | { id: string; userId: string; isVerified?: boolean };
  propertyName: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  // POST /api/properties requires this. It was missing from the type, so any
  // call site that tried to send it failed to compile and was "fixed" by
  // dropping the field — which then 400'd at runtime.
  country?: string;
  locationLat: number;
  locationLng: number;
  accessInstructions?: string;
  propertyImages: string[];
  isActive: boolean;
  status?: 'draft' | 'published';
  createdAt: string;
  totalSpaces?: number;     // present in list responses
  availableSpaces?: number; // present in detail responses
}

export type SpaceStatus = 'active' | 'inactive' | 'maintenance' | 'unavailable';
export type SpaceType = 'outdoor' | 'covered' | 'garage' | 'driveway' | 'carport' | 'street';
export type SpaceVehicleType = 'car' | 'suv' | 'truck' | 'van' | 'motorcycle' | 'bicycle' | 'rv' | 'trailer';
export type BookingMode = 'instant' | 'request' | 'both';

export interface ApiSpace {
  id: string;
  propertyId: string | ApiProperty;
  ownerId: string | { id: string; businessName?: string; userId: string };
  spaceNumber: string;
  spaceType: SpaceType;
  lengthMeters: number;
  widthMeters: number;
  heightMeters?: number;
  allowedVehicleTypes: SpaceVehicleType[];
  spaceDescription?: string;
  spaceImages: string[];
  pricePerHour: number;
  pricePerDay?: number;
  pricePerMonth?: number;
  status: SpaceStatus;
  bookingMode: BookingMode;
  hasEvCharging: boolean;
  isAvailable: boolean;
  totalSpots?: number;
  averageRating: number;
  createdAt: string;
}

export interface ApiAvailabilitySlot {
  id: string;
  spaceId: string;
  dayOfWeek: number;      // 0=Sun ... 6=Sat
  availableFrom: string;  // "HH:MM"
  availableTo: string;    // "HH:MM"
  isAvailable: boolean;
}

// ============================================================================
// Booking types (for owner-facing booking management)
// ============================================================================

export interface ApiBookingUser {
  id: string;
  firstName?: string;
  lastName?: string;
  legalName?: string;
  phone?: string;
  email?: string;
}

export interface ApiBookingSpace {
  id: string;
  spaceNumber: string;
  spaceType: string;
  propertyId: {
    id: string;
    propertyName: string;
    address: string;
    city: string;
    state?: string;
  };
}

export interface ApiBookingVehicle {
  id: string;
  vehicleType: string;       // 'car' | 'suv' | 'truck' | 'van' | 'motorcycle' | 'bicycle' | 'rv' | 'trailer'
  licensePlate: string;
  registrationNumber?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleSize?: string;
}

export interface ApiBooking {
  id: string;
  bookingNumber: string;
  userId: ApiBookingUser | null;        // null if user was deleted
  ownerId: string;
  spaceId: ApiBookingSpace | null;      // null if space was deleted
  vehicleId: ApiBookingVehicle | null;  // null if vehicle was deleted
  startTime: string;
  endTime: string;
  durationHours: number;
  basePrice: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled' | 'rejected' | 'no_show';
  paymentStatus: 'pending' | 'paid' | 'refunded' | 'partially_refunded' | 'failed';
  bookingMode: 'instant' | 'request';
  checkInTime?: string;
  checkOutTime?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt?: string;
}

// ============================================================================
// Owner earnings & stats types
// ============================================================================

export interface ApiEarningsBreakdownItem {
  bookingNumber: string;
  amount: number;
  status: string;
  date: string;
}

export interface ApiOwnerEarnings {
  earningsSummary: {
    totalEarnings: number;
    pendingEarnings: number;
    totalBookings: number;
    averageBookingValue: number;
    earningsBreakdown: ApiEarningsBreakdownItem[];
  };
}

export interface ApiOwnerStats {
  spaceStats: {
    totalSpaces: number;
    activeSpaces: number;
    inactiveSpaces: number;
  };
  bookingStats: {
    totalBookings: number;
    activeBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    occupancyRate: number;
  };
  revenueStats: {
    totalRevenue: number;
    monthlyRevenue: number;
    monthlyBookings: number;
  };
  performance: {
    averageRating: number;
    isVerified: boolean;
  };
}
