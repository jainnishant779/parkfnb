import { api } from '../lib/api';
import type { MeResponse, OnboardingStatus, OtpSent, VerifyResponse } from '../types/api';

/** The same phone-OTP sign-in the owner app uses. Signing in and signing up are one flow: a new number makes an owner account. */
export const authService = {
  sendOtp: (identifier: string) =>
    api.post<OtpSent>('/api/auth/otp/send', { identifier, channel: 'sms' }, { anonymous: true }),

  resendOtp: (identifier: string) =>
    api.post<OtpSent>('/api/auth/otp/resend', { identifier, channel: 'sms' }, { anonymous: true }),

  /** role 'owner' makes the account an owner, as the owner app does; termsAccepted is recorded on a new owner. */
  verifyOtp: (identifier: string, code: string) =>
    api.post<VerifyResponse>(
      '/api/auth/otp/verify',
      { identifier, code, role: 'owner', termsAccepted: true },
      { anonymous: true },
    ),

  me: () => api.get<MeResponse>('/api/auth/me'),

  onboardingStatus: () => api.get<OnboardingStatus>('/api/auth/onboarding-status'),
};
