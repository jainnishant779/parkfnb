import { api, requestPaged } from '../../lib/api';
import type { Owner, OwnerStats } from './types';

/** Backend caps `limit` at 100; 20 keeps the table to a comfortable page. */
export const OWNERS_PAGE_SIZE = 20;

/**
 * GET /api/owners (admin only).
 *
 * Note what the backend does NOT support: it filters on `is_verified` and
 * `owner_type` only — there is no kyc_status filter — and it applies `search`
 * to the current page *after* pagination. So the KYC tabs and the search box
 * both filter client-side over the fetched page; see Owners.tsx, which states
 * this in the UI rather than implying the counts are global.
 */
export const fetchOwners = (page: number, signal?: AbortSignal) =>
  requestPaged<{ owners: Owner[] }>('/api/owners', {
    query: { page, limit: OWNERS_PAGE_SIZE },
    signal,
  });

export const fetchOwner = (id: string, signal?: AbortSignal) =>
  api.get<{ owner: Owner }>(`/api/owners/${id}`, { signal });

export const fetchOwnerStats = (id: string, signal?: AbortSignal) =>
  api.get<OwnerStats>(`/api/owners/${id}/stats`, { signal });

/**
 * PUT /api/owners/:id/verify/kyc — the approve/reject decision.
 *
 * The endpoint takes `isVerified` plus free-text notes. On rejection we put the
 * reason in those notes because that is the only text field this route writes;
 * see the caveat surfaced in OwnerDetail.tsx about kyc_status not being updated
 * by this endpoint.
 */
export const decideKyc = (id: string, isVerified: boolean, verificationNotes: string) =>
  api.put<{ owner: Owner; message?: string }>(`/api/owners/${id}/verify/kyc`, {
    isVerified,
    verificationNotes,
  });
