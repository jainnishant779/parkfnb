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

/**
 * Upload a picked image (react-native-image-picker asset) to POST /api/uploads
 * as the multipart `file` field. Resolves to { url, fullUrl, ... }; store `url`
 * on the profile via updateProfile({ profilePictureUrl }).
 * @param {{ uri: string, type?: string, fileName?: string }} asset
 */
export const uploadProfilePhoto = (asset) => {
  const formData = new FormData();
  formData.append('file', {
    uri: asset.uri,
    type: asset.type || 'image/jpeg',
    name: asset.fileName || `profile-${Date.now()}.jpg`,
  });
  return api.upload('/api/uploads', formData);
};
