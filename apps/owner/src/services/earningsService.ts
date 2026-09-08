import { api } from './api';
import type { ApiOwnerEarnings, ApiOwnerStats } from '../types/api';

/**
 * Build an ISO date string for the start of a given day (midnight local time
 * expressed in UTC so the backend can filter correctly).
 */
function toDateParam(date: Date): string {
  return date.toISOString();
}

/** Returns the start of today (00:00:00 local) as a Date */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Returns the start of the current ISO week (Monday 00:00:00 local) */
export function startOfWeek(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday
  d.setDate(d.getDate() + diff);
  return d;
}

/** Returns the start of the current calendar month (1st 00:00:00 local) */
export function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

const earningsService = {
  /**
   * Fetch owner earnings summary with optional date range.
   * Endpoint: GET /api/owners/:id/earnings?start_date=...&end_date=...
   */
  getOwnerEarnings: (
    ownerId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<ApiOwnerEarnings> => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', toDateParam(startDate));
    if (endDate) params.append('end_date', toDateParam(endDate));
    const query = params.toString() ? `?${params.toString()}` : '';
    return api.get<ApiOwnerEarnings>(`/api/owners/${ownerId}/earnings${query}`);
  },

  /**
   * Fetch owner statistics (spaces, bookings, revenue, performance).
   * Endpoint: GET /api/owners/:id/stats
   */
  getOwnerStats: (ownerId: string): Promise<ApiOwnerStats> => {
    return api.get<ApiOwnerStats>(`/api/owners/${ownerId}/stats`);
  },
};

export default earningsService;
