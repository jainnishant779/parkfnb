import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { ApiError, login } from '../lib/authApi';
import { isAuthenticated, saveSession } from '../lib/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Someone who still holds a token has no reason to see this page.
  if (isAuthenticated()) return <Navigate to="/" replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await login(email.trim(), password);

      // The endpoint signs in any account that has a password set. Only an
      // admin may hold an admin-panel session, so discard a token this panel
      // must not use rather than storing it.
      if (result.user.userType !== 'admin') {
        setError('This account does not have admin access.');
        setPassword('');
        return;
      }

      saveSession(result.token, result.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.');
      setPassword('');
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
          <form onSubmit={handleSubmit}>
            <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">
              Use the email and password issued to your admin account.
            </p>

            <label htmlFor="email" className="mt-6 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@parkfnb.com"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
            />

            <label htmlFor="password" className="mt-4 block text-sm font-medium text-slate-700">
              Password
            </label>
            <div className="relative mt-2">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 pr-11 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && <ErrorNote message={error} />}

            <button
              type="submit"
              disabled={busy || !email.trim() || !password}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-teal py-2.5 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Sign in
            </button>
          </form>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-white/40">
          <KeyRound size={12} />
          Admin accounts only
        </p>
      </div>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
      {message}
    </p>
  );
}
