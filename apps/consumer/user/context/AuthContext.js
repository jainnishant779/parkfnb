/**
 * AuthContext — global auth state for the consumer app.
 *
 * Responsibilities:
 *  - Session restoration on app launch (reads token from AsyncStorage, validates via /api/auth/me)
 *  - Exposes signIn / signOut / updateUser actions to screens
 *  - Drives auth-based navigation in App.tsx via isAuthenticated + user.onboardingStep
 *
 * Pattern: useReducer (same as owner app) adapted for JavaScript + consumer user model.
 */

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../utils/constants';
import { setToken, clearToken } from '../services/api';
import * as authService from '../services/authService';

// ─── State shape ──────────────────────────────────────────────────────────────

const initialState = {
  token: null,
  user: null,       // camelCase user object from /api/auth/me
  isLoading: true,  // true while restoring session on app launch
  isAuthenticated: false,
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

const AUTH_ACTIONS = {
  RESTORE_TOKEN: 'RESTORE_TOKEN',
  SIGN_IN: 'SIGN_IN',
  SIGN_OUT: 'SIGN_OUT',
  UPDATE_USER: 'UPDATE_USER',
};

function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.RESTORE_TOKEN:
      return {
        ...state,
        token: action.token,
        user: action.user,
        isAuthenticated: !!action.token && !!action.user,
        isLoading: false,
      };

    case AUTH_ACTIONS.SIGN_IN:
      return {
        ...state,
        token: action.token,
        user: action.user,
        isAuthenticated: true,
        isLoading: false,
      };

    case AUTH_ACTIONS.SIGN_OUT:
      return {
        ...initialState,
        isLoading: false,
      };

    case AUTH_ACTIONS.UPDATE_USER:
      return {
        ...state,
        user: { ...state.user, ...action.user },
      };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const AuthContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Session restoration on app launch
  useEffect(() => {
    async function restoreSession() {
      const signOutLocally = async () => {
        await AsyncStorage.multiRemove([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.AUTH_USER]);
        dispatch({ type: AUTH_ACTIONS.RESTORE_TOKEN, token: null, user: null });
      };

      let storedToken = null;
      try {
        storedToken = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      } catch {
        // Storage unavailable — nothing to restore.
      }

      if (!storedToken) {
        dispatch({ type: AUTH_ACTIONS.RESTORE_TOKEN, token: null, user: null });
        return;
      }

      // Come up signed in from the cached user straight away. Waiting on the
      // network here meant a cold start on a bad connection showed the
      // sign-in screen before /me had answered.
      let cachedUser = null;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_USER);
        if (raw) cachedUser = JSON.parse(raw);
      } catch {
        cachedUser = null;
      }
      if (cachedUser) {
        dispatch({ type: AUTH_ACTIONS.RESTORE_TOKEN, token: storedToken, user: cachedUser });
      }

      try {
        const data = await authService.getMe();
        const user = data.user;
        if (user) {
          try {
            await AsyncStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(user));
          } catch {
            // Cache write failure is not fatal.
          }
          dispatch({ type: AUTH_ACTIONS.RESTORE_TOKEN, token: storedToken, user });
        } else {
          await signOutLocally();
        }
      } catch (err) {
        // Only a real rejection from the server means the session is dead.
        // This used to clear the token on ANY failure, so one flaky request —
        // a timeout, no signal, the server still waking up — silently logged
        // the user out and sent them back to re-enter their number and OTP.
        const code = err?.code || '';
        const isNetwork = code === 'NETWORK_ERROR' || code === 'NETWORK_TIMEOUT' || err?.http === 0;
        const isAuthFailure = err?.http === 401 || err?.http === 403 || code.startsWith('AUTH_');

        if (isAuthFailure) {
          await signOutLocally();
        } else if (!isNetwork && !cachedUser) {
          // Some other error and nothing cached to fall back on.
          await signOutLocally();
        } else if (!cachedUser) {
          // Offline with no cached user: keep the token, let the app retry.
          dispatch({ type: AUTH_ACTIONS.RESTORE_TOKEN, token: null, user: null });
        }
        // Offline WITH a cached user: stay signed in on the cached session.
      }
    }

    restoreSession();
  }, []);

  // ─── Public actions ─────────────────────────────────────────────────────────

  /**
   * Called from OTPVerification after successful verifyOtp.
   * Stores token in AsyncStorage and updates global state.
   */
  const signIn = async (token, user) => {
    await setToken(token);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(user));
    } catch {
      // Cache write failure is not fatal — the session still works this run.
    }
    dispatch({ type: AUTH_ACTIONS.SIGN_IN, token, user });
  };

  /**
   * Called from profile/settings. Clears token + resets state → auth screen.
   */
  const signOut = async () => {
    await clearToken();
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_USER);
    } catch {
      // Best effort — the token is already gone, so the session is over.
    }
    dispatch({ type: AUTH_ACTIONS.SIGN_OUT });
  };

  /**
   * Called from UserOnboarding after profile save succeeds.
   * Merges updated fields into user state (e.g. onboardingStep: 'completed').
   */
  const updateUser = (user) => {
    dispatch({ type: AUTH_ACTIONS.UPDATE_USER, user });
    // Keep the cached copy in step, so the next cold start restores the
    // updated user (a finished onboarding, say) rather than a stale one.
    AsyncStorage.getItem(STORAGE_KEYS.AUTH_USER)
      .then((raw) => {
        const merged = { ...(raw ? JSON.parse(raw) : {}), ...user };
        return AsyncStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(merged));
      })
      .catch(() => {});
  };

  const value = {
    // State
    token: state.token,
    user: state.user,
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    // Actions
    signIn,
    signOut,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
