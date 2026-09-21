/**
 * App-wide constants: API base URL, AsyncStorage keys, timeouts.
 * Swap API_BASE_URL to your machine's LAN IP when testing on a physical device.
 */

// Deployed on Render, so the app works on any device without a laptop
// running. For local backend work, swap in http://localhost:5000 and run
// `adb reverse tcp:5000 tcp:5000` — plain localhost will not reach a
// physical device otherwise.
export const API_BASE_URL = 'https://parkfnb.onrender.com';

// Render's free tier sleeps after 15 minutes idle and takes roughly a
// minute to wake, so the first request after a quiet spell is slow. Fifteen
// seconds timed that out and looked like the server was down.
export const API_TIMEOUT = 60000; // 60 seconds

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth:token',
  // The signed-in user, cached so a launch with no network still restores the
  // session instead of bouncing the user back to the phone-number screen.
  AUTH_USER: 'auth:user',
  ONBOARDING_DRAFT: 'consumers:onboardingDraft.v1',
};
