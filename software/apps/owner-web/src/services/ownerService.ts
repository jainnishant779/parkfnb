import { API_BASE_URL, api } from '../lib/api';
import type { AuthOwner, AuthUser } from '../types/api';

/**
 * The owner's own record: profile (the person on User, the business or land on Owner), KYC, and file uploads. The same three endpoints the
 * owner app uses (PUT /api/owners/me/profile, /me/kyc/draft, /me/kyc). Bodies are camelCase here; lib/api.ts sends them as snake_case,
 * including inside the KYC blocks.
 */

export interface ProfileInput {
  legalName?: string;
  dateOfBirth?: string;
  email?: string;
  alternatePhone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  /** the backend calls the postal code `pincode` on this endpoint */
  pincode?: string;
  country?: string;
  locationLat?: number;
  locationLng?: number;
  profilePictureUrl?: string;
  ownerType?: string;
  businessName?: string;
  roleDesignation?: string;
  registrationId?: string;
  landLabel?: string;
  landmark?: string;
}

export interface KycPersonal {
  fullName?: string;
  dateOfBirth?: string;
  phone?: string;
  email?: string;
}
export interface KycIdentity {
  documentType?: string;
  documentNumber?: string;
  frontImageUrl?: string;
  backImageUrl?: string;
  selfieImageUrl?: string;
}
export interface KycAddress {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  proofDocumentUrl?: string;
}
export interface KycBank {
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  bankName?: string;
}

export interface KycInput {
  kycPersonal?: KycPersonal;
  kycIdentity?: KycIdentity;
  kycAddress?: KycAddress;
  kycBank?: KycBank;
  /** the backend builds the address block from the profile (only the proof document is taken from `kycAddress`) */
  kycAddressSameAsProfile?: boolean;
}

export interface ProfileResponse {
  user: AuthUser;
  owner: AuthOwner;
}

/** A stored file URL made usable in an <img> or a link: a relative `/uploads/...` path (the dev server's disk storage) gets the API's address. */
export function fileUrl(url: string | null | undefined): string {
  if (!url) return '';
  return url.startsWith('/') ? `${API_BASE_URL.replace(/\/$/, '')}${url}` : url;
}

/** Is this stored file a PDF (which an <img> cannot show)? */
export const isPdf = (url: string | null | undefined): boolean => /\.pdf(\?|#|$)/i.test(url || '');

export const ownerService = {
  updateProfile: (input: ProfileInput) => api.put<ProfileResponse>('/api/owners/me/profile', input),

  saveKycDraft: (input: KycInput) => api.put<{ owner: AuthOwner; message: string }>('/api/owners/me/kyc/draft', input),

  submitKyc: (input: KycInput) => api.put<{ owner: AuthOwner; message: string }>('/api/owners/me/kyc', input),

  /**
   * POST /api/uploads. Returns the URL to store on a record: the absolute one when the server sends it (`fullUrl`, so a photo still works
   * when the page and the API are on different addresses), else what it sent as `url`.
   */
  async upload(file: File): Promise<string> {
    const res = (await api.upload(file)) as { url: string; fullUrl?: string };
    return res.fullUrl || res.url;
  },
};
