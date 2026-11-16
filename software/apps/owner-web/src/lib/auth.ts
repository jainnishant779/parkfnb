/**
 * Where the signed-in owner's token lives.
 *
 * Kept in this leaf module (not api.ts, which imports it) to avoid a circular import. The token is a single JWT from the backend's
 * phone-OTP sign-in; there is no separate refresh token (api.ts swaps a recently expired one for a new one).
 */

const TOKEN_KEY = 'parkfnb_owner_token';

/** Fired when the session ends from the inside (a rejected token); AuthContext listens and sends the person to /login. */
export const SIGNED_OUT_EVENT = 'pf:signed-out';

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Safari in private mode throws on storage access rather than returning null: treat it as "not signed in".
    return null;
  }
};

export const setToken = (token: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage unavailable: the session lasts until the next reload.
  }
};

export const clearSession = (): void => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
};

export const announceSignedOut = (): void => {
  window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
};
