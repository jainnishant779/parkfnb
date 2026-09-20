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
  getOwnerStats: async (ownerId: string): Promise<ApiOwnerStats> => {
    // The backend answers { stats: { total_spaces, total_revenue, ... } } (flat,
    // wrapped in `stats`, and camel-cased by the api layer). The screens expect
    // the grouped ApiOwnerStats shape, so adapt it here. Reading the grouped
    // fields straight off the response made the Dashboard show zeros forever
    // and crashed the Payouts screen (`revenueStats` was undefined).
    const res = await api.get<any>(`/api/owners/${ownerId}/stats`);
    const s = res?.stats ?? res ?? {};
    const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    return {
      spaceStats: {
        totalSpaces: n(s.totalSpaces),
        activeSpaces: n(s.activeSpaces),
        inactiveSpaces: n(s.inactiveSpaces),
      },
      bookingStats: {
        totalBookings: n(s.totalBookings),
        activeBookings: n(s.activeBookings),
        completedBookings: n(s.completedBookings),
        cancelledBookings: n(s.cancelledBookings),
        occupancyRate: n(s.occupancyRate),
      },
      revenueStats: {
        totalRevenue: n(s.totalRevenue),
        monthlyRevenue: n(s.monthlyRevenue),
        monthlyBookings: n(s.monthlyBookings),
      },
      performance: {
        averageRating: n(s.averageRating),
        isVerified: Boolean(s.isVerified),
      },
    };
  },
};

export default earningsService;
