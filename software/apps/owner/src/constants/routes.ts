export const ROUTES = {
  // Auth
  AUTH: {
    WELCOME_OWNER_TYPE: 'WelcomeOwnerType',
    SIGN_IN: 'SignIn',
    SIGN_UP: 'SignUp',
    OTP_VERIFY: 'OtpVerify',
  },

  // Onboarding — collapsed to a single merged screen.
  ONBOARDING: {
    MERGED: 'MergedOnboarding',
    // Legacy multi-step routes kept as constants for any external callers
    // that may still reference them; they no longer resolve to a screen.
    PROFILE_SETUP: 'ProfileSetup',
    KYC_VERIFICATION: 'KycVerification',
    KYC_INTRO: 'KycIntro',
    DOCUMENT_UPLOAD: 'DocumentUpload',
    KYC_STATUS: 'KycStatus',
    BANK_SETUP: 'BankSetup',
  },

  // Main Tabs
  TABS: {
    DASHBOARD: 'Dashboard',
    LISTINGS: 'Listings',
    PROPERTIES: 'Properties',
    BOOKINGS: 'Bookings',
    EARNINGS: 'Earnings',
    MORE: 'More',
    COMPLIANCE: 'Compliance',
  },

  // Screens
  LISTING_DETAILS: 'ListingDetails',
  LISTING_WIZARD: 'ListingWizard',
  ADD_LISTING: 'AddListing',
  BOOKING_DETAILS: 'BookingDetails',
  BOOKING_REQUEST_QUEUE: 'BookingRequestQueue',
  ACCESS_PASS: 'AccessPass',
  CHAT_THREAD: 'ChatThread',
  NOTIFICATIONS: 'Notifications',
  PROFILE: 'Profile',
  SECURITY: 'Security',
  LEGAL: 'Legal',
  HELP_CENTER: 'HelpCenter',
  TICKET_DETAILS: 'TicketDetails',
  AVAILABILITY: 'Availability',
  PROMOTIONS: 'Promotions',
  PAYOUTS: 'Payouts',
  EARNINGS: 'Earnings',
  KYC: 'Kyc',
  PROPERTIES_SLOTS: 'PropertiesSlots',
} as const;
