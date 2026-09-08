/**
 * Session storage and the OTP sign-in flow.
 *
 * The backend has no password login for admins — the same phone/email OTP flow
 * the mobile apps use issues the token, and `user_type` decides who may enter.
 *
 * Token accessors live here rather than in api.ts because api.ts imports them;
 * keeping them in the leaf module avoids a circular import.
 */

const TOKEN_KEY = 'parkfnb_admin_token';
const USER_KEY = 'parkfnb_admin_user';

export interface AdminUser {
  id: string;
  userType: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
}

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Safari in private mode throws on localStorage access rather than
    // returning null. Treat it as "not signed in" instead of crashing.
    return null;
  }
};

export const getStoredUser = (): AdminUser | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  } catch {
    return null;
  }
};

export const isAuthenticated = (): boolean => getToken() !== null;

export const saveSession = (token: string, user: AdminUser): void => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Storage unavailable: the session lives only until the next reload.
  }
};

export const clearSession = (): void => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
};

export const signOut = (): void => {
  clearSession();
  // A full reload, not a router navigation, so no stale privileged data
  // survives in memory after signing out.
  window.location.href = '/login';
};
