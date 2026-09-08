/**
 * Auth service for the consumer app.
 * Wraps OTP endpoints — always sends role: 'user' so the backend
 * creates a consumer User record (no Owner record created).
 */

import * as api from './api';

/**
 * Request OTP for a phone number.
 * @param {string} identifier  10-digit Indian phone number
 * @param {string} channel     'sms' (default)
 */
export const sendOtp = (identifier, channel = 'sms') =>
  api.post('/api/auth/otp/send', { identifier, channel });

/**
 * Verify OTP and sign in / create consumer account.
 * Returns { user, owner: null, token, isNewUser }
 */
export const verifyOtp = (identifier, code) =>
  api.post('/api/auth/otp/verify', { identifier, code, role: 'user' });

/**
 * Resend OTP (invalidates previous, generates new).
 */
export const resendOtp = (identifier, channel = 'sms') =>
  api.post('/api/auth/otp/resend', { identifier, channel });

/**
 * Get current authenticated user (used for session restoration on app launch).
 * Returns { user, owner: null } for consumer users.
 */
export const getMe = () => api.get('/api/auth/me');
