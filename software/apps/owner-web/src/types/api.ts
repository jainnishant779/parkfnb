/** Shapes of what the backend sends, after the camelCase transform in lib/api.ts. Only what the foundation needs; each feature adds its own. */

export interface AuthUser {
  id: string;
  email?: string;
  phone?: string;
  firstName: string;
  lastName: string;
  legalName?: string;
  profilePictureUrl?: string;
  userType: 'user' | 'owner' | 'admin';
  authMethod?: string;
  onboardingStep: 'auth_complete' | 'profile_setup' | 'kyc_submitted' | 'completed' | string;
  isVerified?: boolean;
  alternatePhone?: string;
  dateOfBirth?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  createdAt?: string;
}

export type KycStatus = 'not_started' | 'draft' | 'submitted' | 'verified' | 'rejected';

export interface AuthOwner {
  id: string;
  userId: string;
  ownerType: string;
  businessName?: string;
  roleDesignation?: string;
  registrationId?: string;
  landLabel?: string;
  isVerified?: boolean;
  kycStatus: KycStatus;
  kycRejectionReason?: string;
  kycPersonal?: Record<string, unknown>;
  kycIdentity?: Record<string, unknown>;
  kycAddress?: Record<string, unknown>;
  kycBank?: Record<string, unknown>;
  createdAt?: string;
}

/** /api/auth/me and /api/auth/otp/verify (the latter also has token and isNewUser) */
export interface MeResponse {
  user: AuthUser;
  owner: AuthOwner | null;
}

export interface VerifyResponse extends MeResponse {
  token: string;
  isNewUser: boolean;
}

export interface OnboardingStatus {
  onboardingStep: string;
  kycStatus: KycStatus;
  isOnboardingComplete: boolean;
  nextScreen: string;
}

export interface OtpSent {
  channel?: string;
  expiresIn?: number;
  /** only when the server runs with ALLOW_DEV_OTP and is not in production */
  devCode?: string;
}
