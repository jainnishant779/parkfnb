export const strings = {
  // App
  appName: 'Parking Owner',

  // Auth
  auth: {
    welcome: 'Welcome',
    signIn: 'Sign In',
    signUp: 'Sign Up',
    email: 'Email',
    password: 'Password',
    phone: 'Phone Number',
    forgotPassword: 'Forgot Password?',
    noAccount: "Don't have an account?",
    haveAccount: 'Already have an account?',
    verifyOtp: 'Verify OTP',
    otpSent: 'OTP sent to',
    resendOtp: 'Resend OTP',
  },

  // Onboarding
  onboarding: {
    kycTitle: 'Verify Your Identity',
    kycDescription: 'Complete KYC to start listing your parking spaces',
    uploadDocuments: 'Upload Documents',
    bankSetup: 'Set Up Bank Account',
    pending: 'Verification Pending',
    approved: 'Verification Approved',
    rejected: 'Verification Rejected',
  },

  // Profile Setup
  profileSetup: {
    title: 'Set up your profile',
    subtitle: 'This helps renters trust your listing.',
    steps: {
      profile: 'Profile',
      kyc: 'KYC',
      payouts: 'Payouts',
    },
    sections: {
      identity: 'Personal / Business Identity',
      contact: 'Contact Details',
      address: 'Address & Location',
      business: 'Business / Community Details',
      preferences: 'Preferences',
    },
    fields: {
      ownerType: 'Owner Type',
      legalName: 'Legal Name',
      legalNameHelper: "We'll use this for receipts and verification.",
      profilePhoto: 'Profile Photo',
      email: 'Email',
      emailHelper: 'For booking confirmations and updates.',
      phone: 'Phone Number',
      phoneHelper: 'For urgent booking matters.',
      alternatePhone: 'Alternate Phone',
      addressLine1: 'Address Line 1',
      addressLine2: 'Address Line 2',
      city: 'City',
      state: 'State',
      pincode: 'Pincode',
      pincodeHelper: '6-digit PIN code',
      country: 'Country',
      locationPin: 'Location Pin',
      setPin: 'Set pin',
      businessName: 'Business/Community Name',
      roleDesignation: 'Role/Designation',
      registrationId: 'Registration ID / Tax ID',
      landLabel: 'Land Label/Name',
      landmark: 'Landmark',
      preferredLanguage: 'Preferred Language',
      notifications: 'Notification Preferences',
      timeFormat: 'Time Format',
    },
    notifications: {
      bookingUpdates: 'Booking updates',
      payoutUpdates: 'Payout updates',
      promotions: 'Promotions',
    },
    buttons: {
      continue: 'Continue',
      saveExit: 'Save & exit',
      uploadPhoto: 'Upload',
      takePhoto: 'Take photo',
      chooseLibrary: 'Choose from library',
      removePhoto: 'Remove',
    },
    validation: {
      required: 'This field is required',
      invalidEmail: 'Please enter a valid email',
      invalidPhone: 'Please enter a valid 10-digit phone number',
      invalidPincode: 'Please enter a valid 6-digit pincode',
    },
    status: {
      allSaved: 'All changes saved',
      saving: 'Saving...',
      lastSaved: 'Last saved',
      notSaved: "Couldn't save locally. Changes may be lost.",
    },
  },

  // Dashboard
  dashboard: {
    title: 'Dashboard',
    totalEarnings: 'Total Earnings',
    activeListings: 'Active Listings',
    pendingBookings: 'Pending Bookings',
    todayBookings: "Today's Bookings",
  },

  // Listings
  listings: {
    title: 'My Listings',
    addNew: 'Add New Listing',
    active: 'Active',
    inactive: 'Inactive',
    draft: 'Draft',
  },

  // Bookings
  bookings: {
    title: 'Bookings',
    upcoming: 'Upcoming',
    past: 'Past',
    pending: 'Pending',
    confirmed: 'Confirmed',
    cancelled: 'Cancelled',
  },

  // Common
  common: {
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    next: 'Next',
    back: 'Back',
    done: 'Done',
    loading: 'Loading...',
    error: 'Something went wrong',
    retry: 'Retry',
  },
} as const;
