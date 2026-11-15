/**
 * Parking service for the consumer app.
 * Wraps the public parking-spaces and properties endpoints.
 * No auth required for read operations — these are public APIs.
 */

import * as api from './api';

/**
 * Search available parking spaces near a coordinate.
 * GET /api/parking-spaces/search (public)
 *
 * @param {object} opts
 * @param {number} opts.lat
 * @param {number} opts.lng
 * @param {number} [opts.radius=10]   - km
 * @param {string} [opts.vehicleType] - 'car'|'motorcycle'|'van'|'truck' etc.
 * @param {number} [opts.minPrice]
 * @param {number} [opts.maxPrice]
 * @param {boolean} [opts.hasEvCharging]
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=50]
 * @returns {Promise<{ spaces: object[], meta: object }>}
 */
export const searchNearbySpaces = ({ lat, lng, radius = 10, vehicleType, minPrice, maxPrice, hasEvCharging, page = 1, limit = 50 }) => {
  const params = new URLSearchParams();
  params.append('lat', lat);
  params.append('lng', lng);
  params.append('radius', radius);
  params.append('page', page);
  params.append('limit', limit);
  if (vehicleType) params.append('vehicle_type', vehicleType);
  if (minPrice !== undefined && minPrice > 0) params.append('min_price', minPrice);
  if (maxPrice !== undefined && maxPrice < 999) params.append('max_price', maxPrice);
  if (hasEvCharging) params.append('has_ev_charging', 'true');
  return api.get(`/api/parking-spaces/search?${params.toString()}`);
};

/**
 * Get a single parking space with full property + owner details.
 * GET /api/parking-spaces/:id (public)
 */
export const getSpaceById = (id) => api.get(`/api/parking-spaces/${id}`);

/**
 * Check if a space is available for a given time window.
 * GET /api/parking-spaces/:id/availability (public)
 *
 * @returns {Promise<{ available, durationHours, estimatedPrice, bookingMode }>}
 */
export const checkSpaceAvailability = (spaceId, startDate, endDate) => {
  const params = new URLSearchParams({
    start_date: startDate instanceof Date ? startDate.toISOString() : startDate,
    end_date: endDate instanceof Date ? endDate.toISOString() : endDate,
  });
  return api.get(`/api/parking-spaces/${spaceId}/availability?${params.toString()}`);
};
