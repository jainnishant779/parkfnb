/**
 * Booking service for the consumer app.
 * Wraps the bookings and vehicles endpoints.
 */

import * as api from './api';

/**
 * Create a new booking.
 * POST /api/bookings (private)
 *
 * @param {string} spaceId
 * @param {string} startTime - ISO string
 * @param {string} endTime   - ISO string
 * @param {string} vehicleId
 * @returns {Promise<{ booking: object }>}
 */
export const createBooking = (spaceId, startTime, endTime, vehicleId, paymentMethod) =>
  api.post('/api/bookings', { spaceId, startTime, endTime, vehicleId, payment_method: paymentMethod });

/**
 * Price a booking before making it.
 * POST /api/bookings/quote (private)
 *
 * The backend runs the same arithmetic createBooking will, so whatever this
 * returns is what the booking is actually created with.
 */
export const quoteBooking = (spaceId, startTime, endTime, promoCode) =>
  api.post('/api/bookings/quote', {
    spaceId, startTime, endTime,
    ...(promoCode ? { promo_code: promoCode } : {}),
  });

/**
/**
 * Get bookings for a user.
 * GET /api/bookings/users/:userId/bookings (private)
 * Note: controller returns the bookings array directly as `data` (not { bookings: [] }).
 */
export const getUserBookings = (userId, { page = 1, limit = 10, status } = {}) => {
  const params = new URLSearchParams({ page, limit });
  if (status) params.append('status', status);
  return api.get(`/api/bookings/users/${userId}/bookings?${params}`);
};

/**
 * Cancel a booking.
 * PUT /api/bookings/:id/cancel (private)
 */
export const cancelBooking = (bookingId, reason) =>
  api.put(`/api/bookings/${bookingId}/cancel`, { cancellationReason: reason });

/**
 * Extend a booking duration.
 * PUT /api/bookings/:id/extend (private)
 */
export const extendBooking = (bookingId, additionalHours) =>
  api.put(`/api/bookings/${bookingId}/extend`, { additionalHours });

export const getUserVehicles = (userId) =>
  api.get(`/api/vehicles/users/${userId}/vehicles`);

/**
 * Unlock smart parking barrier for an active booking.
 * POST /api/bookings/:id/unlock (private)
 */
export const unlockBarrier = (bookingId) =>
  api.post(`/api/bookings/${bookingId}/unlock`);

/**
 * Lock smart parking barrier manually.
 * POST /api/bookings/:id/lock (private)
 */
export const lockBarrier = (bookingId) =>
  api.post(`/api/bookings/${bookingId}/lock`);

