// Promo Types and Model for Promotions Screen

export type PromoType = 'PERCENT' | 'FLAT';

export type PromoStatus = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'DRAFT' | 'DISABLED';

export type PromoSortOption = 'newest' | 'ending_soon' | 'highest_value' | 'alphabetical';

export interface PromoUsage {
  totalLimit?: number;
  perUserLimit?: number;
  usedCount: number;
}

export interface Promo {
  id: string;
  name: string;
  code: string;
  type: PromoType;
  value: number;
  currency: string;
  minBookingAmount?: number;
  maxDiscountAmount?: number;
  startAt: string; // ISO string
  endAt: string; // ISO string
  enabled: boolean;
  isDraft: boolean;
  usage: PromoUsage;
  applicableListingIds: string[];
  applyToAllListings: boolean;
  notes?: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface PromoFormData {
  name: string;
  code: string;
  type: PromoType;
  value: string;
  currency: string;
  minBookingAmount: string;
  maxDiscountAmount: string;
  startAt: Date;
  endAt: Date;
  enabled: boolean;
  totalLimit: string;
  perUserLimit: string;
  applyToAllListings: boolean;
  applicableListingIds: string[];
  notes: string;
}

export interface PromoValidationErrors {
  name?: string;
  code?: string;
  value?: string;
  minBookingAmount?: string;
  maxDiscountAmount?: string;
  totalLimit?: string;
  perUserLimit?: string;
  startAt?: string;
  endAt?: string;
  applicableListingIds?: string;
}

// Listing model for selection UI
export interface PromoListing {
  id: string;
  name: string;
  addressShort: string;
  priceHint: string;
  thumbnail?: string;
}

// UI State for promotions screen
export interface PromosUIState {
  selectedTab: PromoStatus | 'ALL';
  searchText: string;
  sortOption: PromoSortOption;
}

// Promo tab counts
export interface PromoTabCounts {
  active: number;
  scheduled: number;
  expired: number;
  draft: number;
}

// Storage schema with versioning
export interface PromosStorageSchema {
  schemaVersion: number;
  promos: Promo[];
  lastUpdated: string;
}

export const PROMO_STORAGE_SCHEMA_VERSION = 1;
