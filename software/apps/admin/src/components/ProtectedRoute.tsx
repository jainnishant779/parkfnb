import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from '../lib/auth';

/**
 * Gates the admin routes behind a stored token.
 *
 * This is a convenience, not a security boundary — every protected endpoint
 * checks `user_type` server-side. It only avoids rendering a shell that would
 * immediately 401.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();

  if (!isAuthenticated()) {
    // Remember where they were headed so sign-in can return them there.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
