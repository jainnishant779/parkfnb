/**
 * The two OTP calls that sign an admin in.
 *
 * Split from auth.ts (which owns token storage) because api.ts imports the
 * token accessors — putting these here keeps the import graph acyclic.
 */

import { api, ApiError } from './api';
import type { AdminUser } from './auth';

interface SendOtpResponse {
  message: string;
  channel: 'sms' | 'email';
  expiresIn: number;
}

interface VerifyOtpResponse {
  user: AdminUser;
  token: string;
  isNewUser: boolean;
}

/**
 * Requests a code for a phone number or email address.
 *
 * In production the code is only written to the server log — the response never
 * carries it — so the UI can do nothing but ask the operator to type what they
 * received.
 */
export const sendOtp = (identifier: string) =>
  api.post<SendOtpResponse>('/api/auth/otp/send', { identifier }, { anonymous: true });

/**
 * Exchanges a code for a token.
 *
 * Any Parkfnb account can pass this endpoint, so the caller must check
 * `user.userType` before treating the result as an admin session.
 */
export const verifyOtp = (identifier: string, code: string) =>
  api.post<VerifyOtpResponse>('/api/auth/otp/verify', { identifier, code }, { anonymous: true });

export { ApiError };
