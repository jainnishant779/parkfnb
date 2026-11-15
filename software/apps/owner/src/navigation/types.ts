import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

// Owner type — superset of what the picker exposes (5) plus the two
// dormant backend values (`business`, `property_manager`). The backend
// enum contains all 7; the frontend only offers 5 in the picker but must
// accept the dormant two from /me responses without crashing — they map
// to the default Listings/Earnings UI like `commercial_property`.
export type OwnerType =
  | 'individual'
  | 'residential_community'
  | 'commercial_property'
  | 'industrial_facility'
  | 'empty_land'
  | 'business'
  | 'property_manager';

// OTP Verify params. `ownerType` is no longer captured pre-auth — the
// backend defaults to `individual` and the real value is set later in
// the merged onboarding screen.
export type OtpVerifyParams = {
  contactLabel: string; // e.g., "+91 98XXXXX765"
  identifier: string;   // 10-digit phone digits only, for API calls
  channel: 'sms';       // phone-only auth
  flow: 'signup' | 'signin';
};

// Auth Stack — owner-type selection has moved out of pre-auth into the
// merged onboarding screen. The WelcomeOwnerType screen is no longer
// reachable; its route entry has been removed from the param list.
export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  OtpVerify: OtpVerifyParams;
};

// Onboarding Stack — collapsed to a single merged screen with collapsible
// KYC-style sections. The legacy multi-step routes (ProfileSetup,
// KycVerification, KycIntro, DocumentUpload, KycStatus, BankSetup) have
// been removed; their screen files are kept on disk for future re-enable.
export type OnboardingStackParamList = {
  MergedOnboarding: { mode?: 'setup' | 'review' } | undefined;
};

// Main Tabs
export type MainTabsParamList = {
  Dashboard: undefined;
  Listings: undefined;
  Properties: undefined;
  Compliance: undefined; // Industrial owners
  Bookings: undefined;
  Earnings: undefined;
  Staff: undefined;
  StaffRoles: undefined; // Industrial owners - Staff & Roles
  LotSetup: undefined; // Empty land owners - Lot Setup
  More: undefined;
};

// Root Stack
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
  MainTabs: NavigatorScreenParams<MainTabsParamList>;
  // Modal/detail screens
  ListingDetails: { spaceId: string };
  ListingWizard: { listingId?: string };
  AddListing: undefined;
  PropertySpaces: { propertyId: string };
  PropertyWizard: { editPropertyId?: string; chainToSpace?: boolean };
  SpaceWizard: { propertyId: string; editSpaceId?: string };
  BookingDetails: { bookingId: string };
  BookingRequestQueue: undefined;
  AccessPass: { bookingId: string };
  ChatThread: { chatId: string };
  Notifications: undefined;
  NotificationPreferences: undefined;
  Profile: undefined;
  Security: undefined;
  Legal: undefined;
  HelpCenter: undefined;
  TicketDetails: { ticketId: string };
  // Quick action screens
  Availability: undefined;
  Promotions: undefined;
  Disputes: undefined; // Empty land owners - replaces Promotions
  Payouts: undefined;
  Earnings: undefined;
  Kyc: { section?: 'personal' | 'identity' | 'address' | 'bank' } | undefined;
  Reviews: undefined;
  // Industrial owners - Fleet/GPS Integrations
  Integrations: undefined;
  FleetManagement: undefined;
  GPSConfiguration: undefined;
  // Commercial owners - IoT/POS Integrations
  IoTIntegrations: undefined;
  // Residential community owners - Properties & Slots
  PropertiesSlots: undefined;
};

// Screen props helpers
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<AuthStackParamList, T>,
    RootStackScreenProps<keyof RootStackParamList>
  >;

export type MainTabsScreenProps<T extends keyof MainTabsParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabsParamList, T>,
    RootStackScreenProps<keyof RootStackParamList>
  >;
