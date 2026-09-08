/**
 * The sign-in call.
 *
 * Split from auth.ts (which owns token storage) because api.ts imports the
 * token accessors — putting this here keeps the import graph acyclic.
 */

import { api, ApiError } from './api';
import type { AdminUser } from './auth';

interface LoginResponse {
  user: AdminUser;
  token: string;
}

/**
 * Signs in with an email and password.
 *
 * Admins do not use the OTP flow the mobile apps use: in production that code
 * is only written to the server log, and reaching a dashboard by reading a
 * deploy log is not a login. Accounts are created by
 * `services/backend/scripts/make-admin.js`.
 *
 * The endpoint signs in any account with a password set, so the caller must
 * check `user.userType` before treating the result as an admin session.
 */
export const login = (email: string, password: string) =>
  api.post<LoginResponse>('/api/auth/login', { email, password }, { anonymous: true });

export { ApiError };
