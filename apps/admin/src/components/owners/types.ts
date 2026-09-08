/**
 * Owner shapes as the admin panel sees them.
 *
 * api.ts camelCases every response key (and maps Mongo's `_id` to `id`), so
 * these mirror services/backend/src/models/Owner.js with that transform applied.
 *
 * The four kyc* blocks are `Schema.Types.Mixed` on the backend with a `null`
 * default: an owner who has not started onboarding has them as null, and a
 * half-finished draft can have some blocks present and others still null.
 * Every field inside them is therefore optional — the owner app writes each
 * block wholesale from its wizard state, and a skipped step writes nothing.
 */

/** Drives the owner app's onboarding gate; see KYC_STATUS_LABEL for why we key off this. */
export type KycStatus = 'not_started' | 'draft' | 'submitted' | 'verified' | 'rejected';

export type OwnerType = 'individual' | 'business' | 'property_manager';

/** Populated from the User document by the backend's `.populate('user_id', ...)`. */
export interface OwnerUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
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

export interface Owner {
  id: string;
  /** Populated on both the list and detail endpoints; a string id if population ever fails. */
  userId: OwnerUser | string | null;
  ownerType: OwnerType;
  businessName?: string;
  roleDesignation?: string;
  registrationId?: string;
  landLabel?: string;
  landmark?: string;
  isVerified: boolean;
  kycStatus?: KycStatus;
  kycRejectionReason?: string;
  kycVerificationNotes?: string;
  kycSubmittedAt?: string;
  kycVerifiedAt?: string;
  kycPersonal?: KycPersonal | null;
  kycIdentity?: KycIdentity | null;
  kycAddress?: KycAddress | null;
  kycBank?: KycBank | null;
  payoutBankAccount?: string;
  payoutMethod?: string;
  totalEarnings?: number;
  averageRating?: number;
  createdAt?: string;
}

/** GET /api/owners/:id/stats — only the fields this section reads. */
export interface OwnerStats {
  totalSpaces?: number;
  totalBookings?: number;
  totalEarnings?: number;
  averageRating?: number;
}

/**
 * The Owner schema defaults kyc_status to 'not_started', but rows created
 * before that field existed have it undefined — treat those as not started
 * rather than letting the badge fall through to an empty cell.
 */
export const kycStatusOf = (owner: Owner): KycStatus => owner.kycStatus ?? 'not_started';

/** The person's name, preferring the KYC legal name once they have supplied one. */
export const ownerDisplayName = (owner: Owner): string => {
  const user = typeof owner.userId === 'object' && owner.userId !== null ? owner.userId : null;
  const fromUser = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return owner.kycPersonal?.fullName?.trim() || fromUser || owner.businessName?.trim() || 'Unnamed owner';
};

export const ownerPhone = (owner: Owner): string | undefined => {
  const user = typeof owner.userId === 'object' && owner.userId !== null ? owner.userId : null;
  return user?.phoneNumber || owner.kycPersonal?.phone;
};

export const ownerEmail = (owner: Owner): string | undefined => {
  const user = typeof owner.userId === 'object' && owner.userId !== null ? owner.userId : null;
  return user?.email || owner.kycPersonal?.email;
};

export const OWNER_TYPE_LABEL: Record<OwnerType, string> = {
  individual: 'Individual',
  business: 'Business',
  property_manager: 'Property manager',
};

/** Business identity fields only apply to these two types. */
export const isBusinessOwner = (ownerType: OwnerType): boolean =>
  ownerType === 'business' || ownerType === 'property_manager';
