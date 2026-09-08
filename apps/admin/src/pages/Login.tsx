import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { ApiError } from '../lib/api';
import { sendOtp, verifyOtp } from '../lib/authApi';
import { isAuthenticated, saveSession } from '../lib/auth';

const CODE_LENGTH = 6;

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'identifier' | 'code'>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Someone who still holds a token has no reason to see this page.
  if (isAuthenticated()) return <Navigate to="/" replace />;

  const handleSendCode = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await sendOtp(identifier.trim());
      setChannel(result.channel);
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await verifyOtp(identifier.trim(), code);

      // The OTP endpoint signs in any Parkfnb account — drivers and owners
      // included. Only an admin may hold an admin-panel session, so discard
      // the token rather than storing one this panel must not use.
      if (result.user.userType !== 'admin') {
        setError('This account does not have admin access.');
        setCode('');
        return;
      }

      saveSession(result.token, result.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-teal">
            <ShieldCheck className="h-6 w-6 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold tracking-[0.2em] text-white">PARKFNB</h1>
          <p className="mt-1 text-sm text-white/50">Admin Panel</p>
        </div>

        <div className="rounded-card bg-white p-7 shadow-card">
          {step === 'identifier' ? (
            <form onSubmit={handleSendCode}>
              <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
              <p className="mt-1 text-sm text-slate-500">
                We&rsquo;ll send a one-time code to your registered phone or email.
              </p>

              <label htmlFor="identifier" className="mt-6 block text-sm font-medium text-slate-700">
                Phone number or email
              </label>
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                autoFocus
                required
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="+91 98765 43210"
                className="mt-2 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
              />

              {error && <ErrorNote message={error} />}

              <SubmitButton busy={busy} disabled={identifier.trim().length === 0}>
                Send code
              </SubmitButton>
            </form>
          ) : (
            <form onSubmit={handleVerify}>
              <button
                type="button"
                onClick={() => {
                  setStep('identifier');
                  setCode('');
                  setError(null);
                }}
                className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-teal"
              >
                <ArrowLeft className="h-4 w-4" />
                Change {channel === 'email' ? 'email' : 'number'}
              </button>

              <h2 className="text-lg font-semibold text-slate-900">Enter your code</h2>
              <p className="mt-1 text-sm text-slate-500">
                Sent via {channel === 'email' ? 'email' : 'SMS'} to{' '}
                <span className="font-medium text-slate-700">{identifier}</span>.
              </p>

              <label htmlFor="code" className="mt-6 block text-sm font-medium text-slate-700">
                {CODE_LENGTH}-digit code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                value={code}
                // Strip non-digits as they are typed so a pasted code with
                // spaces or dashes still verifies.
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))
                }
                placeholder="000000"
                className="mt-2 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-center text-lg font-semibold tracking-[0.5em] outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
              />

              {error && <ErrorNote message={error} />}

              <SubmitButton busy={busy} disabled={code.length !== CODE_LENGTH}>
                Verify and sign in
              </SubmitButton>
            </form>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-white/40">
          <KeyRound className="h-3.5 w-3.5" />
          Admin accounts only
        </p>
      </div>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

function SubmitButton({
  busy,
  disabled,
  children,
}: {
  busy: boolean;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-teal py-2.5 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
