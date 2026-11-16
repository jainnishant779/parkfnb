import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthFrame from '../components/AuthFrame';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { authService } from '../services/authService';

/**
 * Sign in with a phone number and a 6-digit code: the same OTP the owner app uses. Signing in and signing up are one step; a new number
 * makes an owner account and then goes through onboarding (profile, KYC). The code is sent by the backend's SMS provider.
 */
const PHONE_RE = /^[6-9]\d{9}$/;
const RESEND_AFTER_S = 30;

/** What was typed, reduced to the 10-digit number: spaces, dashes, +91, 91 and a leading 0 are allowed. */
const tenDigits = (raw: string): string => {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
};

export default function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from || '/';

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [terms, setTerms] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lock, setLock] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  // already signed in: straight to where they were going
  useEffect(() => {
    if (auth.status === 'ready') navigate(from, { replace: true });
  }, [auth.status, from, navigate]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  if (auth.status === 'ready') return <Navigate to={from} replace />;

  const number = tenDigits(phone);
  const fail = (e: unknown, fallback: string) => {
    setLock(e instanceof ApiError && e.status === 429);
    setError(e instanceof ApiError ? e.message : fallback);
  };

  const send = async (resend = false) => {
    setBusy(true);
    setError(null);
    try {
      const r = await (resend ? authService.resendOtp(number) : authService.sendOtp(number));
      setDevCode(r.devCode || null);
      setStep('code');
      setCode('');
      setWait(RESEND_AFTER_S);
    } catch (e) {
      fail(e, 'Could not send the code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitPhone = (e: FormEvent) => {
    e.preventDefault();
    if (!PHONE_RE.test(number)) return setError('Enter a 10-digit mobile number.');
    if (!terms) return setError('Please agree to the Terms and Privacy Policy to continue.');
    void send();
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code.');
    setBusy(true);
    setError(null);
    try {
      const r = await authService.verifyOtp(number, code);
      await auth.signIn(r.token);
    } catch (err) {
      fail(err, 'Could not check the code. Please try again.');
      setBusy(false);
    }
  };

  return (
    <AuthFrame>
      {step === 'phone' ? (
        <form onSubmit={submitPhone} noValidate>
          <h1>Sign in</h1>
          <p className="lead">Use the phone number you use in the ParkFNB owner app. A new number starts a new owner account.</p>
          {error && <div className={`msg${lock ? ' lock' : ''}`} role="alert">{error}</div>}
          <label className="f">
            Mobile number
            <div className="phone">
              <span>+91</span>
              <input type="tel" inputMode="numeric" autoComplete="tel-national" autoFocus placeholder="98765 43210" maxLength={16}
                value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={Boolean(error) && !PHONE_RE.test(number)} />
            </div>
          </label>
          <label className="check">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span>
              I agree to the <a href="https://parkfnb-website.vercel.app/terms" target="_blank" rel="noreferrer">Terms</a> and{' '}
              <a href="https://parkfnb-website.vercel.app/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
            </span>
          </label>
          <button type="submit" className="btn primary go" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
        </form>
      ) : (
        <form onSubmit={submitCode} noValidate>
          <h1>Enter the code</h1>
          <p className="lead">We sent a 6-digit code to +91 {number}.</p>
          {error && <div className={`msg${lock ? ' lock' : ''}`} role="alert">{error}</div>}
          {devCode && <div className="msg info">Test code from the server: <b className="mono">{devCode}</b></div>}
          <label className="f">
            Code
            <input ref={codeRef} className="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="······"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </label>
          <button type="submit" className="btn primary go" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Sign in'}</button>
          <div className="back">
            <button type="button" disabled={busy || wait > 0} onClick={() => void send(true)}>
              {wait > 0 ? `Send again in ${wait} s` : 'Send the code again'}
            </button>
            {' · '}
            <button type="button" onClick={() => { setStep('phone'); setError(null); setDevCode(null); }}>Change number</button>
          </div>
        </form>
      )}
    </AuthFrame>
  );
}
