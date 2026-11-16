import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './components/AppShell';
import { Btn, Empty } from './components/ui';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PAGES } from './routes';
import Login from './pages/Login';
import AuthFrame from './components/AuthFrame';

const Onboarding = lazy(() => import('./pages/Onboarding'));
const Kyc = lazy(() => import('./pages/Kyc'));

/**
 * Where a visitor may be:
 *   not signed in            -> /login
 *   signed in, not onboarded -> /onboarding (profile, then KYC); the dashboard is closed until KYC is at least submitted
 *   signed in and onboarded  -> the dashboard
 * `allowIncomplete` is for the onboarding pages themselves.
 */
function RequireAuth({ children, allowIncomplete }: { children: ReactNode; allowIncomplete?: boolean }) {
  const auth = useAuth();
  const loc = useLocation();
  if (auth.status === 'loading') {
    return (
      <AuthFrame>
        <Empty>Loading your account…</Empty>
      </AuthFrame>
    );
  }
  if (auth.status === 'signedOut') return <Navigate to="/login" replace state={{ from: `${loc.pathname}${loc.search}` }} />;
  if (auth.status === 'error') {
    return (
      <AuthFrame>
        <h1>Can&apos;t reach your account</h1>
        <p className="lead">{auth.loadError || 'The server did not answer.'} Your sign-in is kept; try again in a moment.</p>
        <Btn variant="primary" className="go" onClick={() => void auth.refresh()}>Try again</Btn>
        <div className="back"><button type="button" onClick={auth.signOut}>Sign out</button></div>
      </AuthFrame>
    );
  }
  if (!allowIncomplete && !auth.onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<AuthFrame><Empty>Loading…</Empty></AuthFrame>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<RequireAuth allowIncomplete><Onboarding /></RequireAuth>} />
            <Route path="/kyc" element={<RequireAuth allowIncomplete><Kyc /></RequireAuth>} />
            <Route element={<RequireAuth><AppShell /></RequireAuth>}>
              {PAGES.map((p) => (
                <Route key={p.path} path={p.path} element={<p.element />} />
              ))}
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
