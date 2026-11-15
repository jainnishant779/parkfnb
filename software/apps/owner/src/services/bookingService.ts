/**
 * Booking service — owner-facing booking management API calls.
 * All paths are relative to API_BASE_URL (set in config/api.ts).
 * Request/response bodies are auto-transformed camelCase ↔ snake_case
 * by the interceptors in api.ts.
 */

import { api } from './api';
import type { ApiBooking } from '../types/api';

export interface OwnerBookingsResponse {
  bookings: ApiBooking[];
  total: number;
  page: number;
  totalPages: number;
}

export interface BookingActionResponse {
  booking: ApiBooking;
}

export interface CheckOutResponse {
  booking: ApiBooking;
  overtime: { charge: number; message: string } | null;
}

export interface CancelResponse {
  booking: ApiBooking;
  refund: { amount: number; percentage: number; status: string };
}

export const bookingService = {
  /**
   * Get all bookings for a specific owner.
   * @param ownerId  Owner._id (from AuthContext owner.id)
   * @param params   Optional filters and pagination
   */
  getOwnerBookings: (
    ownerId: string,
    params?: { status?: string; page?: number; limit?: number }
  ): Promise<OwnerBookingsResponse> => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page)   query.set('page', String(params.page));
    if (params?.limit)  query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    // This endpoint returns the bookings array as `data`, with page/total in
    // `meta` — which api.ts discards. Older builds returned an object. Accept
    // both so callers can always read `.bookings`.
    return api
      .get<ApiBooking[] | Partial<OwnerBookingsResponse>>(
        `/api/bookings/owners/${ownerId}/bookings${qs}`,
      )
      .then((res): OwnerBookingsResponse => {
        const bookings = Array.isArray(res) ? res : res?.bookings ?? [];
        const wrapped = Array.isArray(res) ? undefined : res;
        return {
          bookings,
          total: wrapped?.total ?? bookings.length,
          page: wrapped?.page ?? params?.page ?? 1,
          totalPages: wrapped?.totalPages ?? 1,
        };
      });
  },

  /** Get a single booking by ID with full populate. */
  getBookingById: (id: string): Promise<BookingActionResponse> =>
    api.get<BookingActionResponse>(`/api/bookings/${id}`),

  /** Approve a pending request-mode booking (sets status='confirmed', payment_status='paid'). */
  approveBooking: (id: string): Promise<BookingActionResponse> =>
    api.put<BookingActionResponse>(`/api/bookings/${id}/approve`, {}),

  /** Reject a pending request-mode booking (sets status='rejected', payment_status='failed'). */
  rejectBooking: (id: string, reason?: string): Promise<BookingActionResponse> =>
    api.put<BookingActionResponse>(`/api/bookings/${id}/reject`, {
      rejectionReason: reason,
    }),

  /** Cancel a booking (works for pending, confirmed, active). May create a refund record. */
  cancelBooking: (id: string, reason?: string): Promise<CancelResponse> =>
    api.put<CancelResponse>(`/api/bookings/${id}/cancel`, {
      cancellationReason: reason,
    }),

  /**
   * Check in a renter.
   * Window: 1h before → 1h after start_time.
   * If called after window: backend auto-marks no_show and returns BIZ_OPERATION_NOT_ALLOWED.
   * If called before window: returns BIZ_OPERATION_NOT_ALLOWED with "not opened yet".
   */
  checkInBooking: (id: string): Promise<BookingActionResponse> =>
    api.put<BookingActionResponse>(`/api/bookings/${id}/checkin`, {}),

  /**
   * Check out a renter. If now > end_time, overtime charges (1.5× hourly rate) are applied.
   * Response includes overtime field when applicable.
   */
  checkOutBooking: (id: string): Promise<CheckOutResponse> =>
    api.put<CheckOutResponse>(`/api/bookings/${id}/checkout`, {}),

  /**
   * Explicitly mark a booking as no-show (owner-initiated).
   * Booking must be 'confirmed' or 'active'.
   */
  markNoShow: (id: string): Promise<BookingActionResponse> =>
    api.put<BookingActionResponse>(`/api/bookings/${id}/noshow`, {}),
};
