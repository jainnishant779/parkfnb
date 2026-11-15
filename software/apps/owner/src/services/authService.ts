import { api } from './api';
import type {
  OtpSendResponse,
  AuthResponse,
  OnboardingStatus,
  AuthUser,
  AuthOwner,
} from '../types/api';

export const authService = {
  sendOtp: (identifier: string, channel: 'sms' | 'email') =>
    api.post<OtpSendResponse>('/api/auth/otp/send', { identifier, channel }),

  verifyOtp: (
    identifier: string,
    code: string,
    ownerType: string,
    termsAccepted: boolean,
  ) =>
    api.post<AuthResponse>('/api/auth/otp/verify', {
      identifier,
      code,
      // This is the owner app, so the account is an owner even before the
      // wizard asks which kind. Without role the backend would create a
      // consumer, and the Owner record the dashboard needs never appears.
      role: 'owner',
      ownerType,
      termsAccepted,
    }),

  resendOtp: (identifier: string, channel: 'sms' | 'email') =>
    api.post<OtpSendResponse>('/api/auth/otp/resend', { identifier, channel }),

  getOnboardingStatus: () =>
    api.get<OnboardingStatus>('/api/auth/onboarding-status'),

  getMe: () => api.get<{ user: AuthUser; owner: AuthOwner | null }>('/api/auth/me'),

  refreshToken: () =>
    api.post<{ token: string; message: string }>('/api/auth/refresh-token'),
};
