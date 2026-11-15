// Seed promos data for initial app state
import type { Promo, PromosUIState, PromoSortOption } from '../types/promo';

// Helper to get dates relative to now
const now = new Date();
const addDays = (days: number): string => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const subtractDays = (days: number): string => {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

// Seed promos covering different statuses
export const seedPromos: Promo[] = [
  // Active promo - currently running
  {
    id: 'promo_001',
    name: 'Weekend Saver',
    code: 'WEEKEND10',
    type: 'PERCENT',
    value: 10,
    currency: 'INR',
    minBookingAmount: 100,
    maxDiscountAmount: 200,
    startAt: subtractDays(5),
    endAt: addDays(10),
    enabled: true,
    isDraft: false,
    usage: {
      totalLimit: 100,
      perUserLimit: 2,
      usedCount: 23,
    },
    applicableListingIds: ['listing_001', 'listing_002', 'listing_003'],
    applyToAllListings: false,
    notes: 'Weekend promotion to attract more customers',
    createdAt: subtractDays(10),
    updatedAt: subtractDays(5),
  },
  // Active promo - flat discount
  {
    id: 'promo_002',
    name: 'First Booking Bonus',
    code: 'FIRST50',
    type: 'FLAT',
    value: 50,
    currency: 'INR',
    minBookingAmount: 200,
    maxDiscountAmount: undefined,
    startAt: subtractDays(30),
    endAt: addDays(30),
    enabled: true,
    isDraft: false,
    usage: {
      totalLimit: undefined,
      perUserLimit: 1,
      usedCount: 87,
    },
    applicableListingIds: [],
    applyToAllListings: true,
    notes: 'New customer acquisition',
    createdAt: subtractDays(35),
    updatedAt: subtractDays(30),
  },
  // Scheduled promo - starts in future
  {
    id: 'promo_003',
    name: 'New Year Special',
    code: 'NEWYEAR25',
    type: 'PERCENT',
    value: 25,
    currency: 'INR',
    minBookingAmount: 150,
    maxDiscountAmount: 500,
    startAt: addDays(15),
    endAt: addDays(45),
    enabled: true,
    isDraft: false,
    usage: {
      totalLimit: 200,
      perUserLimit: 3,
      usedCount: 0,
    },
    applicableListingIds: ['listing_001', 'listing_004', 'listing_005'],
    applyToAllListings: false,
    notes: 'Special discount for New Year celebrations',
    createdAt: subtractDays(2),
    updatedAt: subtractDays(2),
  },
  // Expired promo
  {
    id: 'promo_004',
    name: 'Diwali Discount',
    code: 'DIWALI20',
    type: 'PERCENT',
    value: 20,
    currency: 'INR',
    minBookingAmount: 100,
    maxDiscountAmount: 300,
    startAt: subtractDays(60),
    endAt: subtractDays(30),
    enabled: true,
    isDraft: false,
    usage: {
      totalLimit: 150,
      perUserLimit: 2,
      usedCount: 142,
    },
    applicableListingIds: [],
    applyToAllListings: true,
    notes: 'Diwali festival promotion - completed successfully',
    createdAt: subtractDays(70),
    updatedAt: subtractDays(30),
  },
  // Draft promo - incomplete
  {
    id: 'promo_005',
    name: 'Summer Sale',
    code: 'SUMMER15',
    type: 'PERCENT',
    value: 15,
    currency: 'INR',
    minBookingAmount: undefined,
    maxDiscountAmount: undefined,
    startAt: addDays(60),
    endAt: addDays(90),
    enabled: false,
    isDraft: true,
    usage: {
      totalLimit: undefined,
      perUserLimit: undefined,
      usedCount: 0,
    },
    applicableListingIds: [],
    applyToAllListings: true,
    notes: 'Draft for summer campaign - needs review',
    createdAt: subtractDays(1),
    updatedAt: subtractDays(1),
  },
];

// Default UI state
export const defaultPromosUIState: PromosUIState = {
  selectedTab: 'ACTIVE',
  searchText: '',
  sortOption: 'newest',
};

// Default sort preference
export const defaultPromoSortPref: PromoSortOption = 'newest';
