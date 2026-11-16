import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { SIGNED_OUT_EVENT, clearSession, getToken, setToken } from '../lib/auth';
import { stopGrants } from '../lib/anpr';
import { authService } from '../services/authService';
import type { AuthOwner, AuthUser, KycStatus } from '../types/api';

/**
 * Who is signed in, and how far through onboarding they are.
 *
 *   loading     a token is stored and /auth/me has not answered yet
 *   signedOut   no token, or the server refused it
 *   ready       signed in (user and owner loaded)
 *   error       signed in, but the server could not be reached to find out more (the page offers a retry, and keeps the token)
 *
 * Restoring a session calls /auth/me and /auth/onboarding-status together, as the owner app does.
 */
export type AuthStatus = 'loading' | 'signedOut' | 'ready' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  owner: AuthOwner | null;
  onboardingStep: string | null;
  kycStatus: KycStatus | null;
  /** true once the owner may see the dashboard: profile done and KYC at least submitted */
  onboarded: boolean;
  loadError: string | null;
  /** after a successful /otp/verify */
  signIn: (token: string) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const ONBOARDED_STEPS = ['completed', 'kyc_submitted'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() => (getToken() ? 'loading' : 'signedOut'));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [owner, setOwner] = useState<AuthOwner | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<KycStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reset = useCallback(() => {
    stopGrants();
    setUser(null);
    setOwner(null);
    setOnboardingStep(null);
    setKycStatus(null);
    setLoadError(null);
    setStatus('signedOut');
  }, []);

  const load = useCallback(async () => {
    try {
      const [me, onboarding] = await Promise.all([authService.me(), authService.onboardingStatus()]);
      setUser(me.user);
      setOwner(me.owner);
      setOnboardingStep(onboarding.onboardingStep || me.user.onboardingStep);
      setKycStatus(onboarding.kycStatus || me.owner?.kycStatus || null);
      setLoadError(null);
      setStatus('ready');
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
        clearSession();
        reset();
      } else {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load your account');
        setStatus('error');
      }
    }
  }, [reset]);

  useEffect(() => {
    if (getToken()) void load();
  }, [load]);

  // The API client ends the session when the server refuses the token.
  useEffect(() => {
    window.addEventListener(SIGNED_OUT_EVENT, reset);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, reset);
  }, [reset]);

  const signIn = useCallback(
    async (token: string) => {
      setToken(token);
      setStatus('loading');
      await load();
    },
    [load],
  );

  const signOut = useCallback(() => {
    clearSession();
    reset();
  }, [reset]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      owner,
      onboardingStep,
      kycStatus,
      onboarded: onboardingStep !== null && ONBOARDED_STEPS.includes(onboardingStep),
      loadError,
      signIn,
      refresh: load,
      signOut,
    }),
    [status, user, owner, onboardingStep, kycStatus, loadError, signIn, load, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
