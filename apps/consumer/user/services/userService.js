/**
 * User service for the consumer app.
 * Handles consumer profile updates.
 */

import * as api from './api';

/**
 * Save consumer profile and advance onboarding_step to 'completed'.
 * @param {{ legalName?, notificationBooking?, notificationPromotion?, preferredLanguage? }} data
 */
export const updateProfile = (data) =>
  api.put('/api/users/me/profile', data);
