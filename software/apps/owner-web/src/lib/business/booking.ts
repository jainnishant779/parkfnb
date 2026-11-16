/**
 * Reading a booking the way an owner does: who, which car, which space, which tab it belongs to, and which decisions the owner may
 * still make on it. The decisions follow the backend's own state rules (bookingsController.js), so a button is offered only where the
 * backend can accept it by status. Rules that depend on the clock (check-in opens an hour before the start, a no-show needs the start to
 * have passed) are left to the backend, which says so in words the page shows.
 */
import type { Tone } from '../../components/ui';
import type { Booking, BookingProperty, BookingSpace, BookingStatus, BookingVehicle, PaymentStatus, Renter } from '../../types/business';

const obj = <T extends object>(v: T | string | null | undefined): T | null => (v && typeof v === 'object' ? v : null);

export const renterOf = (b: Booking): Renter | null => obj<Renter>(b.userId);
export const spaceOf = (b: Booking): BookingSpace | null => obj<BookingSpace>(b.spaceId);
export const propertyOf = (b: Booking): BookingProperty | null => obj<BookingProperty>(spaceOf(b)?.propertyId);
export const vehicleOf = (b: Booking): BookingVehicle | null => obj<BookingVehicle>(b.vehicleId);

export function renterName(b: Booking): string {
  const r = renterOf(b);
  const name = [r?.firstName, r?.lastName].filter(Boolean).join(' ') || r?.legalName;
  return name || 'Renter';
}

export const renterPhone = (b: Booking): string => renterOf(b)?.phone || '';

export const plateOf = (b: Booking): string => vehicleOf(b)?.licensePlate || '';

export function vehicleLabel(b: Booking): string {
  const v = vehicleOf(b);
  return [v?.make || v?.vehicleMake, v?.model || v?.vehicleModel].filter(Boolean).join(' ');
}

export const spaceNumber = (b: Booking): string => spaceOf(b)?.spaceNumber || '–';
export const propertyName = (b: Booking): string => propertyOf(b)?.propertyName || 'Property';

// ----------------------------------------------------------------------------- tabs

export type BookingTab = 'requests' | 'upcoming' | 'active' | 'past';

export const TABS: { value: BookingTab; label: string }[] = [
  { value: 'requests', label: 'Requests' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'active', label: 'Active' },
  { value: 'past', label: 'Past' },
];

/** pending is a request waiting for the owner; confirmed is coming up; active is parked now; everything else is over. */
export function tabOf(b: Booking): BookingTab {
  if (b.status === 'pending') return 'requests';
  if (b.status === 'confirmed') return 'upcoming';
  if (b.status === 'active') return 'active';
  return 'past';
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Request',
  confirmed: 'Confirmed',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  no_show: 'No-show',
};

export const STATUS_TONE: Record<BookingStatus, Tone> = {
  pending: 'amber',
  confirmed: 'blue',
  active: 'green',
  completed: '',
  cancelled: '',
  rejected: 'red',
  no_show: 'amber',
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: 'Unpaid',
  paid: 'Paid',
  refunded: 'Refunded',
  partially_refunded: 'Part refunded',
  failed: 'Not paid',
};

export const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  pending: 'amber',
  paid: 'green',
  refunded: 'blue',
  partially_refunded: 'blue',
  failed: 'red',
};

// ----------------------------------------------------------------------------- decisions

export type BookingAction = 'approve' | 'reject' | 'checkIn' | 'checkOut' | 'noShow';

/**
 * What the owner may do with a booking, by its status:
 *   pending    approve or reject the request
 *   confirmed  check the renter in (from an hour before the start), or mark a no-show
 *   active     check the renter out (and a no-show only if nobody was ever checked in)
 * Cancelling is not offered: the backend refuses an owner's cancel with 403 (it compares the Owner id with the User id), so a button
 * would never work.
 */
export function actionsFor(b: Booking): BookingAction[] {
  switch (b.status) {
    case 'pending':
      return ['approve', 'reject'];
    case 'confirmed':
      return ['checkIn', 'noShow'];
    case 'active':
      return b.checkInTime ? ['checkOut'] : ['checkOut', 'noShow'];
    default:
      return [];
  }
}

/** Everything a search box should match on, lower-cased. */
export function haystack(b: Booking): string {
  return [b.bookingNumber, renterName(b), renterPhone(b), plateOf(b), vehicleLabel(b), propertyName(b), spaceNumber(b)].join(' ').toLowerCase();
}
