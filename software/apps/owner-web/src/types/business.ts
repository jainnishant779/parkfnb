/**
 * Shapes of what the backend sends for bookings, earnings and barriers, after the camelCase transform in lib/api.ts (`_id` becomes `id`).
 * A populated reference is an object; an unpopulated one is the bare id, so every reference is typed as either.
 */

export type BookingStatus = 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled' | 'rejected' | 'no_show';
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'partially_refunded' | 'failed';

export interface Renter {
  id?: string;
  firstName?: string;
  lastName?: string;
  legalName?: string;
  phone?: string;
  email?: string;
}

export interface BookingProperty {
  id?: string;
  propertyName?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

export interface BookingSpace {
  id?: string;
  spaceNumber?: string;
  spaceType?: string;
  propertyId?: BookingProperty | string | null;
}

export interface BookingVehicle {
  id?: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleType?: string;
}

export interface Booking {
  id: string;
  bookingNumber: string;
  userId: Renter | string | null;
  ownerId?: unknown;
  spaceId: BookingSpace | string | null;
  vehicleId?: BookingVehicle | string | null;
  startTime: string;
  endTime: string;
  durationHours: number;
  basePrice: number;
  discountAmount?: number;
  totalAmount: number;
  currency?: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  rejectionReason?: string;
  cancellationReason?: string;
  cancelledAt?: string | null;
  refundAmount?: number;
  overtimeCharge?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** GET /api/owners/:id/earnings -> { earningsSummary } */
export interface EarningsSummary {
  totalEarnings: number;
  pendingEarnings: number;
  totalBookings: number;
  averageBookingValue: number;
  earningsBreakdown: { bookingNumber: string; amount: number; status: string; date: string }[];
}

/** GET /api/owners/:id/stats -> { stats } */
export interface OwnerStats {
  totalSpaces: number;
  activeSpaces: number;
  inactiveSpaces: number;
  totalBookings: number;
  activeBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  totalRevenue: number;
  monthlyRevenue: number;
  monthlyBookings: number;
  averageRating: number;
  occupancyRate: number;
  isVerified: boolean;
}

export interface BarrierState {
  state?: string;
  angle?: number;
  target?: number;
  moving?: boolean;
  rssi?: number;
  batteryLevel?: number;
  fwVersion?: string;
  faultReason?: string | null;
  updatedAt?: string;
}

export interface BarrierSpace {
  id?: string;
  spaceNumber?: string;
  spaceType?: string;
  pricePerHour?: number;
  propertyId?: string;
}

/**
 * A barrier as GET /api/devices/my-devices lists it. The backend also sends the device's secret token; it is deliberately not typed
 * here and never shown.
 */
export interface Barrier {
  id: string;
  deviceId: string;
  name: string;
  deviceType?: string;
  status: 'online' | 'offline' | 'error' | 'maintenance' | string;
  lastState?: BarrierState;
  lastSeenAt?: string | null;
  parkingSpaceId?: BarrierSpace | string | null;
}

export interface BarrierTelemetry {
  deviceId: string;
  name: string;
  status: string;
  lastState?: BarrierState;
  lastSeenAt?: string | null;
  parkingSpace?: BarrierSpace | null;
  isBrokerConnected?: boolean;
}

export interface AccessLog {
  id: string;
  deviceId: string;
  action: string;
  success: boolean;
  errorMessage?: string | null;
  userRole?: string;
  commandN?: number;
  createdAt: string;
}

/** A space the owner can pair a barrier to. */
export interface OwnerSpace {
  id: string;
  spaceNumber: string;
  propertyName: string;
  spaceType?: string;
  deviceId?: string | null;
}
