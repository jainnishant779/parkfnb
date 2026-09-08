/**
 * App-wide constants: API base URL, AsyncStorage keys, timeouts.
 * Swap API_BASE_URL to your machine's LAN IP when testing on a physical device.
 */

// Backend is deployed on Render and used for both dev and prod builds —
// no LAN-IP juggling needed for physical-device testing.
export const API_BASE_URL = 'http://localhost:5000';

export const API_TIMEOUT = 15000; // 15 seconds

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth:token',
  ONBOARDING_DRAFT: 'consumers:onboardingDraft.v1',
};
