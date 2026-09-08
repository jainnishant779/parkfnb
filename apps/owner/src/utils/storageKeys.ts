// Storage keys for AsyncStorage persistence
export const STORAGE_KEYS = {
  // OTP Screen persistence
  OTP_DRAFT: 'otp_draft',
  OTP_TIMER_ENDS_AT: 'otp_timer_ends_at',
  OTP_CONTACT_LABEL: 'otp_contact_label',
  OTP_FLOW: 'otp_flow',
  OTP_OWNER_TYPE: 'otp_owner_type',

  // Auth persistence
  OWNER_TYPE: 'ownerType',
  AUTH_TOKEN: 'auth_token',
  USER_DATA: 'user_data',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
