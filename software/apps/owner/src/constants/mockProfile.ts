// Mock profile data for local development and testing
// This is UI-only data - no backend/network integration

export type VerificationStatus = 'verified' | 'pending' | 'rejected' | 'unverified';

export interface MockOwnerProfile {
  ownerId: string;
  ownerName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatarInitials: string;
  verificationStatus: VerificationStatus;
  unreadNotificationsCount: number;
  memberSince: string;
}

// Default mock owner profile
export const MOCK_OWNER_PROFILE: MockOwnerProfile = {
  ownerId: 'owner_001',
  ownerName: 'Rajesh Kumar',
  firstName: 'Rajesh',
  lastName: 'Kumar',
  email: 'rajesh.kumar@example.com',
  phone: '+91 98765 43210',
  avatarInitials: 'RK',
  verificationStatus: 'pending',
  unreadNotificationsCount: 3,
  memberSince: '2024-06-15',
};

// Alternative mock profiles for testing different states
export const MOCK_PROFILES: Record<string, MockOwnerProfile> = {
  verified: {
    ...MOCK_OWNER_PROFILE,
    verificationStatus: 'verified',
    unreadNotificationsCount: 0,
  },
  pending: {
    ...MOCK_OWNER_PROFILE,
    verificationStatus: 'pending',
    unreadNotificationsCount: 3,
  },
  rejected: {
    ...MOCK_OWNER_PROFILE,
    verificationStatus: 'rejected',
    unreadNotificationsCount: 1,
  },
  unverified: {
    ...MOCK_OWNER_PROFILE,
    verificationStatus: 'unverified',
    unreadNotificationsCount: 5,
  },
};

// Helper to get formatted date subtitle
export function getFormattedDateSubtitle(): string {
  const now = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const dayName = days[now.getDay()];
  const date = now.getDate();
  const monthName = months[now.getMonth()];

  return `${dayName}, ${date} ${monthName}`;
}

// Helper to get greeting based on time of day
export function getGreeting(): string {
  const hour = new Date().getHours();

  if (hour < 12) {
    return 'Good morning';
  } else if (hour < 17) {
    return 'Good afternoon';
  } else {
    return 'Good evening';
  }
}

// Helper to get owner display name with greeting
export function getOwnerGreeting(firstName: string): string {
  return `Hi, ${firstName}`;
}
