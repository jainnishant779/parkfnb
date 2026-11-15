/**
 * Transforms backend ApiBooking objects into the frontend FullBooking shape
 * used by BookingsListScreen, BookingCard, DashboardScreen, etc.
 *
 * Also provides helpers for refund policy and check-in window calculations.
 */

import type { ApiBooking } from '../types/api';
import type { FullBooking, BookingStatus, VehicleType } from '../types/models';

/**
 * Map a backend ApiBooking → frontend FullBooking.
 * All populated fields are accessed with null guards so deleted
 * users/spaces/vehicles degrade gracefully.
 */
export function transformBooking(b: ApiBooking): FullBooking {
  const space   = b.spaceId;
  const user    = b.userId;
  const vehicle = b.vehicleId;

  const propertyName = space?.propertyId?.propertyName ?? 'Unknown Property';
  const spaceNumber  = space?.spaceNumber ?? '—';
  const address      = space?.propertyId
    ? `${space.propertyId.address}, ${space.propertyId.city}`
    : 'Address unavailable';

  const renterName = user
    ? (user.legalName ||
       `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
       // OTP sign-ups have a phone but no name until the profile is filled in.
       (user.phone ? `+91 ${user.phone}` : 'Unknown Renter'))
    : 'Unknown Renter';

  return {
    id:           b.id,
    status:       mapBookingStatus(b.status),
    listingId:    space?.id ?? '',
    listingName:  `${propertyName} · ${spaceNumber}`,
    addressLine:  address,
    startAt:      b.startTime,
    endAt:        b.endTime,
    vehicle: {
      type:  mapVehicleType(vehicle?.vehicleType ?? ''),
      plate: vehicle?.licensePlate ?? 'N/A',
    },
    renterName,
    renterPhone:  user?.phone,
    priceTotal:   b.totalAmount,
    currency:     b.currency || 'INR',
    createdAt:    b.createdAt,
    flags:        {},
    notes:        b.cancellationReason,
  };
}

/**
 * Map backend booking status → frontend BookingStatus enum value.
 * Frontend uses UPPER_CASE; backend uses lower_case.
 */
function mapBookingStatus(s: ApiBooking['status']): BookingStatus {
  const map: Record<ApiBooking['status'], BookingStatus> = {
    pending:   'REQUESTED',
    confirmed: 'UPCOMING',
    active:    'ACTIVE',
    completed: 'COMPLETED',
    cancelled: 'CANCELLED',
    rejected:  'REJECTED',
    no_show:   'NO_SHOW',
  };
  return map[s] ?? 'UPCOMING';
}

/**
 * Map backend vehicle type string → frontend VehicleType enum value.
 * Backend has more granular types (suv, rv, bicycle…) that we bucket.
 */
function mapVehicleType(t: string): VehicleType {
  switch (t) {
    case 'motorcycle': return 'BIKE';
    case 'truck':      return 'TRUCK';
    case 'van':        return 'VAN';
    default:           return 'CAR'; // car, suv, bicycle, rv, trailer → CAR
  }
}

// ─── Policy helpers ──────────────────────────────────────────────────────────

export interface RefundPolicy {
  percentage: number;
  label: string;
}

/**
 * Calculate the applicable cancellation refund policy based on time until start.
 * Mirrors the backend logic in cancelBooking.
 *   > 48h  → 100% refund
 *   24-48h → 50% refund
 *   < 24h  → 0% refund
 */
export function getRefundPolicy(startTime: string): RefundPolicy {
  const hoursUntilStart = (new Date(startTime).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntilStart > 48) {
    return { percentage: 100, label: 'Full refund — cancellation is >48h before start' };
  }
  if (hoursUntilStart > 24) {
    return { percentage: 50, label: '50% refund — cancellation is 24–48h before start' };
  }
  return { percentage: 0, label: 'No refund — cancellation is <24h before start' };
}

export interface CheckInWindow {
  opensAt:  Date;
  closesAt: Date;
  /** True if current time is within the check-in window */
  isOpen:   boolean;
  /** True if current time is before the window opens */
  tooEarly: boolean;
  /** True if current time is after the window closed */
  tooLate:  boolean;
}

/**
 * Compute the check-in window for a booking.
 * Backend allows check-in from 1h before to 1h after start_time.
 */
export function getCheckInWindow(startTime: string): CheckInWindow {
  const start    = new Date(startTime);
  const opensAt  = new Date(start.getTime() - 60 * 60 * 1000); // start - 1h
  const closesAt = new Date(start.getTime() + 60 * 60 * 1000); // start + 1h
  const now      = new Date();

  return {
    opensAt,
    closesAt,
    isOpen:   now >= opensAt && now <= closesAt,
    tooEarly: now < opensAt,
    tooLate:  now > closesAt,
  };
}

/**
 * Format a Date as a short time string e.g. "9:05 AM"
 */
export function formatBookingTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString('en-IN', {
    hour:   'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a Date as a short date string e.g. "Mon, Jan 20"
 */
export function formatBookingDate(date: Date | string): string {
  const d = new Date(date);
  const today    = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (d.toDateString() === today.toDateString())    return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

  return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
}
