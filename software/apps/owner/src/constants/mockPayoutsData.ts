// Mock Payouts Data for Local Development
// No backend/API calls - all data is local

export type PayoutStatus = 'paid' | 'pending' | 'processing' | 'failed' | 'scheduled' | 'on_hold';
export type PayoutMethod = 'bank_transfer' | 'upi' | 'wallet';
export type PayoutFrequency = 'weekly' | 'biweekly' | 'monthly';
export type AccountType = 'savings' | 'current';

export interface Payout {
  id: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: PayoutStatus;
  method: PayoutMethod;
  date: string; // ISO date string
  processedAt?: string;
  failureReason?: string;
  bankName: string;
  accountLast4: string;
  referenceId?: string;
  timeline?: {
    initiated: string;
    processing?: string;
    completed?: string;
    failed?: string;
  };
}

export interface PayoutAccount {
  id: string;
  holderName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  accountType: AccountType;
  isVerified: boolean;
  isDefault: boolean;
  addedAt: string;
}

export interface PayoutPreferences {
  autoPayoutEnabled: boolean;
  frequency: PayoutFrequency;
  minimumThreshold: number;
  notifyOnPayout: boolean;
}

export interface PayoutSummary {
  availableBalance: number;
  pendingAmount: number;
  paidYTD: number;
  availableTrend: number; // percentage
  pendingTrend: number;
  paidTrend: number;
}

export interface UpcomingPayout {
  date: string;
  expectedAmount: number;
  status: 'scheduled' | 'processing' | 'on_hold';
  currentStep: 0 | 1 | 2; // 0: Earnings, 1: Processing, 2: Deposit
}

// Helper to generate past dates
const daysAgo = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

const daysFromNow = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

// Generate mock payouts (last 90 days)
export const MOCK_PAYOUTS: Payout[] = [
  {
    id: 'PO-2025-00001',
    amount: 15000.00,
    fee: 25.00,
    netAmount: 14975.00,
    status: 'paid',
    method: 'bank_transfer',
    date: daysAgo(2),
    processedAt: daysAgo(1),
    bankName: 'HDFC Bank',
    accountLast4: '4521',
    referenceId: 'TXN2025001234',
    timeline: {
      initiated: daysAgo(3),
      processing: daysAgo(2),
      completed: daysAgo(1),
    },
  },
  {
    id: 'PO-2025-00002',
    amount: 8500.50,
    fee: 15.00,
    netAmount: 8485.50,
    status: 'processing',
    method: 'bank_transfer',
    date: daysAgo(0),
    bankName: 'HDFC Bank',
    accountLast4: '4521',
    timeline: {
      initiated: daysAgo(1),
      processing: daysAgo(0),
    },
  },
  {
    id: 'PO-2025-00003',
    amount: 12300.00,
    fee: 20.00,
    netAmount: 12280.00,
    status: 'paid',
    method: 'bank_transfer',
    date: daysAgo(7),
    processedAt: daysAgo(6),
    bankName: 'HDFC Bank',
    accountLast4: '4521',
    referenceId: 'TXN2025001233',
    timeline: {
      initiated: daysAgo(8),
      processing: daysAgo(7),
      completed: daysAgo(6),
    },
  },
  {
    id: 'PO-2025-00004',
    amount: 5000.00,
    fee: 10.00,
    netAmount: 4990.00,
    status: 'failed',
    method: 'bank_transfer',
    date: daysAgo(10),
    failureReason: 'Bank account verification failed. Please update your account details.',
    bankName: 'ICICI Bank',
    accountLast4: '7890',
    timeline: {
      initiated: daysAgo(11),
      processing: daysAgo(10),
      failed: daysAgo(10),
    },
  },
  {
    id: 'PO-2025-00005',
    amount: 18750.25,
    fee: 30.00,
    netAmount: 18720.25,
    status: 'paid',
    method: 'bank_transfer',
    date: daysAgo(14),
    processedAt: daysAgo(13),
    bankName: 'HDFC Bank',
    accountLast4: '4521',
    referenceId: 'TXN2025001232',
    timeline: {
      initiated: daysAgo(15),
      processing: daysAgo(14),
      completed: daysAgo(13),
    },
  },
  {
    id: 'PO-2025-00006',
    amount: 9200.00,
    fee: 15.00,
    netAmount: 9185.00,
    status: 'pending',
    method: 'bank_transfer',
    date: daysAgo(1),
    bankName: 'HDFC Bank',
    accountLast4: '4521',
    timeline: {
      initiated: daysAgo(1),
    },
  },
  {
    id: 'PO-2025-00007',
    amount: 22000.00,
    fee: 35.00,
    netAmount: 21965.00,
    status: 'paid',
    method: 'bank_transfer',
    date: daysAgo(21),
    processedAt: daysAgo(20),
    bankName: 'HDFC Bank',
    accountLast4: '4521',
    referenceId: 'TXN2025001231',
    timeline: {
      initiated: daysAgo(22),
      processing: daysAgo(21),
      completed: daysAgo(20),
    },
  },
  {
    id: 'PO-2025-00008',
    amount: 7500.00,
    fee: 12.50,
    netAmount: 7487.50,
    status: 'paid',
    method: 'bank_transfer',
    date: daysAgo(28),
    processedAt: daysAgo(27),
    bankName: 'HDFC Bank',
    accountLast4: '4521',
    referenceId: 'TXN2025001230',
    timeline: {
      initiated: daysAgo(29),
      processing: daysAgo(28),
      completed: daysAgo(27),
    },
  },
  {
    id: 'PO-2025-00009',
    amount: 3200.00,
    fee: 8.00,
    netAmount: 3192.00,
    status: 'failed',
    method: 'bank_transfer',
    date: daysAgo(35),
    failureReason: 'Insufficient details. IFSC code mismatch.',
    bankName: 'SBI',
    accountLast4: '1234',
    timeline: {
      initiated: daysAgo(36),
      processing: daysAgo(35),
      failed: daysAgo(35),
    },
  },
  {
    id: 'PO-2025-00010',
    amount: 16800.75,
    fee: 28.00,
    netAmount: 16772.75,
    status: 'paid',
    method: 'bank_transfer',
    date: daysAgo(42),
    processedAt: daysAgo(41),
    bankName: 'HDFC Bank',
    accountLast4: '4521',
    referenceId: 'TXN2025001229',
    timeline: {
      initiated: daysAgo(43),
      processing: daysAgo(42),
      completed: daysAgo(41),
    },
  },
  {
    id: 'PO-2025-00011',
    amount: 11250.00,
    fee: 18.75,
    netAmount: 11231.25,
    status: 'paid',
    method: 'bank_transfer',
    date: daysAgo(49),
    processedAt: daysAgo(48),
    bankName: 'HDFC Bank',
    accountLast4: '4521',
    referenceId: 'TXN2025001228',
    timeline: {
      initiated: daysAgo(50),
      processing: daysAgo(49),
      completed: daysAgo(48),
    },
  },
  {
    id: 'PO-2025-00012',
    amount: 19500.00,
    fee: 32.50,
    netAmount: 19467.50,
    status: 'paid',
    method: 'bank_transfer',
    date: daysAgo(56),
    processedAt: daysAgo(55),
    bankName: 'HDFC Bank',
    accountLast4: '4521',
    referenceId: 'TXN2025001227',
    timeline: {
      initiated: daysAgo(57),
      processing: daysAgo(56),
      completed: daysAgo(55),
    },
  },
  {
    id: 'PO-2025-00013',
    amount: 4500.00,
    fee: 7.50,
    netAmount: 4492.50,
    status: 'paid',
    method: 'bank_transfer',
    date: daysAgo(63),
    processedAt: daysAgo(62),
    bankName: 'HDFC Bank',
    accountLast4: '4521',
    referenceId: 'TXN2025001226',
    timeline: {
      initiated: daysAgo(64),
      processing: daysAgo(63),
      completed: daysAgo(62),
    },
  },
  {
    id: 'PO-2025-00014',
    amount: 28000.00,
    fee: 45.00,
    netAmount: 27955.00,
    status: 'paid',
    method: 'bank_transfer',
    date: daysAgo(70),
    processedAt: daysAgo(69),
    bankName: 'HDFC Bank',
    accountLast4: '4521',
    referenceId: 'TXN2025001225',
    timeline: {
      initiated: daysAgo(71),
      processing: daysAgo(70),
      completed: daysAgo(69),
    },
  },
  {
    id: 'PO-2025-00015',
    amount: 13750.00,
    fee: 22.92,
    netAmount: 13727.08,
    status: 'paid',
    method: 'bank_transfer',
    date: daysAgo(77),
    processedAt: daysAgo(76),
    bankName: 'HDFC Bank',
    accountLast4: '4521',
    referenceId: 'TXN2025001224',
    timeline: {
      initiated: daysAgo(78),
      processing: daysAgo(77),
      completed: daysAgo(76),
    },
  },
  {
    id: 'PO-2025-00016',
    amount: 6800.00,
    fee: 11.33,
    netAmount: 6788.67,
    status: 'paid',
    method: 'bank_transfer',
    date: daysAgo(84),
    processedAt: daysAgo(83),
    bankName: 'HDFC Bank',
    accountLast4: '4521',
    referenceId: 'TXN2025001223',
    timeline: {
      initiated: daysAgo(85),
      processing: daysAgo(84),
      completed: daysAgo(83),
    },
  },
];

// Default payout account
export const DEFAULT_PAYOUT_ACCOUNT: PayoutAccount = {
  id: 'acc_001',
  holderName: 'Rajesh Kumar',
  bankName: 'HDFC Bank',
  accountNumber: '50100123454521',
  ifscCode: 'HDFC0001234',
  accountType: 'savings',
  isVerified: true,
  isDefault: true,
  addedAt: daysAgo(180),
};

// Default preferences
export const DEFAULT_PAYOUT_PREFERENCES: PayoutPreferences = {
  autoPayoutEnabled: true,
  frequency: 'weekly',
  minimumThreshold: 1000,
  notifyOnPayout: true,
};

// Summary data (can be derived but provided for convenience)
export const MOCK_PAYOUT_SUMMARY: PayoutSummary = {
  availableBalance: 23500.50,
  pendingAmount: 17700.50,
  paidYTD: 185325.75,
  availableTrend: 12.5,
  pendingTrend: -5.2,
  paidTrend: 8.3,
};

// Upcoming payout
export const MOCK_UPCOMING_PAYOUT: UpcomingPayout = {
  date: daysFromNow(3),
  expectedAmount: 23500.50,
  status: 'scheduled',
  currentStep: 0,
};

// Storage keys
export const PAYOUTS_STORAGE_KEYS = {
  PREFERENCES: 'owners:payoutPreferences',
  ACCOUNTS: 'owners:payoutAccounts',
  FILTERS: 'owners:payoutFilters',
} as const;

// Payout status configuration
export const PAYOUT_STATUS_CONFIG: Record<PayoutStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}> = {
  paid: {
    label: 'Paid',
    color: '#10B981',
    bgColor: '#ECFDF5',
    icon: 'checkmark-circle',
  },
  pending: {
    label: 'Pending',
    color: '#F59E0B',
    bgColor: '#FFFBEB',
    icon: 'time',
  },
  processing: {
    label: 'Processing',
    color: '#0D7377',
    bgColor: '#E8F5F4',
    icon: 'sync',
  },
  failed: {
    label: 'Failed',
    color: '#EF4444',
    bgColor: '#FEF2F2',
    icon: 'close-circle',
  },
  scheduled: {
    label: 'Scheduled',
    color: '#8B5CF6',
    bgColor: '#F5F3FF',
    icon: 'calendar',
  },
  on_hold: {
    label: 'On Hold',
    color: '#F97316',
    bgColor: '#FFF7ED',
    icon: 'pause-circle',
  },
};

// Frequency options
export const FREQUENCY_OPTIONS: { value: PayoutFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
];

// Date range filters
export const DATE_RANGE_OPTIONS = [
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
] as const;

// Status filter options
export const STATUS_FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed', label: 'Failed' },
] as const;
