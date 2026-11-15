/**
 * User, Booking, Payment and Refund shapes as the admin panel sees them.
 *
 * api.ts camelCases every response key and maps Mongo's `_id` to `id`, so these
 * mirror the backend models with that transform applied. Nearly every field is
 * optional: the list endpoints project a subset via `.select()`/`.populate()`,
 * and several columns are genuinely absent on real records (an OTP-only user
 * has no email, an unpaid booking has no check-in time).
 */

/* ---------------------------------------------------------------------- users */

/** services/backend/src/models/User.js — user_type enum. */
export type UserType = 'user' | 'owner' | 'admin';

/** Drives which stack the mobile apps show on launch; useful as a signup-progress column. */
export type OnboardingStep = 'auth_complete' | 'profile_setup' | 'kyc_submitted' | 'completed';

export interface User {
  id: string;
  /**
   * Both optional and sparse-unique on the backend: a phone-OTP signup has no
   * email and an email/password signup may have no phone. Neither may be
   * assumed present.
   */
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  legalName?: string;
  userType?: UserType;
  authMethod?: 'password' | 'otp';
  onboardingStep?: OnboardingStep;
  isVerified?: boolean;
  isActive?: boolean;
  alternatePhone?: string;
  dateOfBirth?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  preferredLanguage?: string;
  profilePictureUrl?: string | null;
  lastLogin?: string;
  createdAt?: string;
}

export const USER_TYPE_LABEL: Record<UserType, string> = {
  user: 'Driver',
  owner: 'Owner',
  admin: 'Admin',
};

export const ONBOARDING_STEP_LABEL: Record<OnboardingStep, string> = {
  auth_complete: 'Signed up',
  profile_setup: 'Profile setup',
  kyc_submitted: 'KYC submitted',
  completed: 'Completed',
};

/**
 * `first_name`/`last_name` default to '' on the backend and stay empty until
 * profile setup, so a freshly OTP-signed-up user genuinely has no name.
 */
export const userDisplayName = (user: User): string => {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.legalName?.trim() || 'Unnamed user';
};

/* ------------------------------------------------------------------- bookings */

/** services/backend/src/models/Booking.js — status enum, complete. */
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'no_show';

/** Booking.payment_status — separate enum from Payment.payment_status. */
export type BookingPaymentStatus = 'pending' | 'paid' | 'refunded' | 'partially_refunded' | 'failed';

/** Every value the Booking model allows, in lifecycle order for the filter bar. */
export const BOOKING_STATUSES: BookingStatus[] = [
  'pending',
  'confirmed',
  'active',
  'completed',
  'cancelled',
  'rejected',
  'no_show',
];

/** Populated by `.populate('user_id', 'email first_name last_name phone')`. */
export interface BookingUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

/** Nested inside the space by the list endpoint's two-level populate. */
export interface BookingProperty {
  id: string;
  propertyName?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

export interface BookingSpace {
  id: string;
  spaceNumber?: string;
  spaceType?: string;
  hourlyRate?: number;
  dailyRate?: number;
  propertyId?: BookingProperty | string | null;
}

export interface BookingVehicle {
  id: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  licensePlate?: string;
}

/** Only the detail endpoint populates the owner. */
export interface BookingOwner {
  id: string;
  businessName?: string;
  userId?: string;
}

export interface Booking {
  id: string;
  bookingNumber?: string;
  status: BookingStatus;
  paymentStatus?: BookingPaymentStatus;
  startTime?: string;
  endTime?: string;
  durationHours?: number;
  basePrice?: number;
  discountAmount?: number;
  totalAmount?: number;
  /** Defaults to 'USD' on the backend while the apps quote INR — render, never assume. */
  currency?: string;
  checkInTime?: string;
  checkOutTime?: string;
  rejectionReason?: string;
  cancellationReason?: string;
  createdAt?: string;
  userId?: BookingUser | string | null;
  ownerId?: BookingOwner | string | null;
  spaceId?: BookingSpace | string | null;
  vehicleId?: BookingVehicle | string | null;
}

/* ------------------------------------------------------------------- payments */

/** services/backend/src/models/Payment.js — payment_status enum, complete. */
export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

export const PAYMENT_STATUSES: PaymentStatus[] = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
];

export type PaymentMethod =
  | 'credit_card'
  | 'debit_card'
  | 'paypal'
  | 'apple_pay'
  | 'google_pay'
  | 'bank_transfer';

export type PaymentProvider = 'stripe' | 'paypal' | 'square' | 'braintree';

/** Populated by `.populate('booking_id', 'booking_number space_id start_time end_time')`. */
export interface PaymentBooking {
  id: string;
  bookingNumber?: string;
  startTime?: string;
  endTime?: string;
  totalAmount?: number;
}

export interface PaymentUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface Payment {
  id: string;
  paymentNumber?: string;
  amount?: number;
  /** Defaults to 'USD' on the backend, same mismatch as Booking. */
  currency?: string;
  paymentMethod?: PaymentMethod;
  paymentProvider?: PaymentProvider;
  /**
   * Fabricated by the backend, not returned by a gateway — see the disclosure
   * banner on the Payments page.
   */
  providerTransactionId?: string;
  paymentStatus?: PaymentStatus;
  paidAt?: string;
  createdAt?: string;
  userId?: PaymentUser | string | null;
  bookingId?: PaymentBooking | string | null;
}

/* -------------------------------------------------------------------- refunds */

/** services/backend/src/models/Refund.js — status enum, complete. */
export type RefundStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export const REFUND_STATUSES: RefundStatus[] = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
];

export interface RefundPayment {
  id: string;
  paymentNumber?: string;
  amount?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
}

export interface RefundBooking {
  id: string;
  bookingNumber?: string;
  totalAmount?: number;
  userId?: BookingUser | string | null;
  spaceId?: { id: string; spaceNumber?: string; spaceType?: string } | string | null;
}

export interface Refund {
  id: string;
  refundAmount?: number;
  refundReason?: string;
  status?: RefundStatus;
  processedAt?: string;
  createdAt?: string;
  paymentId?: RefundPayment | string | null;
  bookingId?: RefundBooking | string | null;
}
