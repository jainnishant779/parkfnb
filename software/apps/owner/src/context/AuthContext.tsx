import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { getToken, setToken, clearToken } from '../services/api';
import { authService } from '../services/authService';
import type { AuthUser, AuthOwner, OnboardingStatus } from '../types/api';

// State
interface AuthState {
  token: string | null;
  user: AuthUser | null;
  owner: AuthOwner | null;
  onboardingStep: string;
  kycStatus: string;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  token: null,
  user: null,
  owner: null,
  onboardingStep: 'auth_complete',
  kycStatus: 'not_started',
  isLoading: true,
  isAuthenticated: false,
};

// Actions
type AuthAction =
  | { type: 'RESTORE_TOKEN'; token: string; user: AuthUser; owner: AuthOwner | null; onboardingStep: string; kycStatus: string }
  | { type: 'SIGN_IN'; token: string; user: AuthUser; owner: AuthOwner | null }
  | { type: 'SIGN_OUT' }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'UPDATE_ONBOARDING'; onboardingStep: string; kycStatus?: string }
  | { type: 'UPDATE_USER'; user: AuthUser }
  | { type: 'UPDATE_OWNER'; owner: AuthOwner };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'RESTORE_TOKEN':
      return {
        ...state,
        token: action.token,
        user: action.user,
        owner: action.owner,
        onboardingStep: action.onboardingStep,
        kycStatus: action.kycStatus,
        isLoading: false,
        isAuthenticated: true,
      };
    case 'SIGN_IN':
      return {
        ...state,
        token: action.token,
        user: action.user,
        owner: action.owner,
        onboardingStep: action.user.onboardingStep || 'auth_complete',
        isLoading: false,
        isAuthenticated: true,
      };
    case 'SIGN_OUT':
      return {
        ...initialState,
        isLoading: false,
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };
    case 'UPDATE_ONBOARDING':
      return {
        ...state,
        onboardingStep: action.onboardingStep,
        kycStatus: action.kycStatus ?? state.kycStatus,
      };
    case 'UPDATE_USER':
      return { ...state, user: action.user };
    case 'UPDATE_OWNER':
      return { ...state, owner: action.owner };
    default:
      return state;
  }
}

// Context
interface AuthContextValue extends AuthState {
  signIn: (token: string, user: AuthUser, owner: AuthOwner | null) => Promise<void>;
  signOut: () => Promise<void>;
  updateOnboardingStep: (step: string, kycStatus?: string) => void;
  updateUser: (user: AuthUser) => void;
  updateOwner: (owner: AuthOwner) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // On mount: try to restore session from stored token
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const token = await getToken();
        if (!token) {
          dispatch({ type: 'SET_LOADING', isLoading: false });
          return;
        }

        // Validate token by fetching user + onboarding status
        const [meResponse, onboardingStatus] = await Promise.all([
          authService.getMe(),
          authService.getOnboardingStatus(),
        ]);

        dispatch({
          type: 'RESTORE_TOKEN',
          token,
          user: meResponse.user,
          owner: meResponse.owner,
          onboardingStep: onboardingStatus.onboardingStep,
          kycStatus: onboardingStatus.kycStatus,
        });
      } catch {
        // Token invalid or expired and refresh failed — start fresh
        await clearToken();
        dispatch({ type: 'SET_LOADING', isLoading: false });
      }
    };

    restoreSession();
  }, []);

  const signIn = useCallback(async (token: string, user: AuthUser, owner: AuthOwner | null) => {
    await setToken(token);
    dispatch({ type: 'SIGN_IN', token, user, owner });
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    dispatch({ type: 'SIGN_OUT' });
  }, []);

  const updateOnboardingStep = useCallback((step: string, kycStatus?: string) => {
    dispatch({ type: 'UPDATE_ONBOARDING', onboardingStep: step, kycStatus });
  }, []);

  const updateUser = useCallback((user: AuthUser) => {
    dispatch({ type: 'UPDATE_USER', user });
  }, []);

  const updateOwner = useCallback((owner: AuthOwner) => {
    dispatch({ type: 'UPDATE_OWNER', owner });
  }, []);

  const value: AuthContextValue = {
    ...state,
    signIn,
    signOut,
    updateOnboardingStep,
    updateUser,
    updateOwner,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
