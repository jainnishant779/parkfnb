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
      try {
        const storedToken = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);

        if (!storedToken) {
          dispatch({ type: AUTH_ACTIONS.RESTORE_TOKEN, token: null, user: null });
          return;
        }

        // Validate token by fetching user profile
        const data = await authService.getMe();
        const user = data.user;

        if (user) {
          dispatch({ type: AUTH_ACTIONS.RESTORE_TOKEN, token: storedToken, user });
        } else {
          // Token invalid / user deleted
          await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
          dispatch({ type: AUTH_ACTIONS.RESTORE_TOKEN, token: null, user: null });
        }
      } catch {
        // getMe failed (expired/invalid token) — clear and start fresh
        await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        dispatch({ type: AUTH_ACTIONS.RESTORE_TOKEN, token: null, user: null });
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
    dispatch({ type: AUTH_ACTIONS.SIGN_IN, token, user });
  };

  /**
   * Called from profile/settings. Clears token + resets state → auth screen.
   */
  const signOut = async () => {
    await clearToken();
    dispatch({ type: AUTH_ACTIONS.SIGN_OUT });
  };

  /**
   * Called from UserOnboarding after profile save succeeds.
   * Merges updated fields into user state (e.g. onboardingStep: 'completed').
   */
  const updateUser = (user) => {
    dispatch({ type: AUTH_ACTIONS.UPDATE_USER, user });
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
