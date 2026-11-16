import { api } from '../lib/api';
import type { EarningsSummary, OwnerStats } from '../types/business';

/**
 * Both endpoints wrap their answer ({ earningsSummary } and { stats }), and the earnings one filters by the day a booking was MADE
 * (created_at), not the day it was parked or paid. So the Earnings page works out its range figures from the bookings themselves
 * (one source for the tiles, the chart and the table) and uses these two only for what the bookings list cannot say: earnings
 * still waiting to be paid, and all-time totals.
 */
export const earningsService = {
  async summary(ownerId: string, signal?: AbortSignal): Promise<EarningsSummary> {
    return (await api.get<{ earningsSummary: EarningsSummary }>(`/api/owners/${ownerId}/earnings`, { signal })).earningsSummary;
  },

  async stats(ownerId: string, signal?: AbortSignal): Promise<OwnerStats> {
    return (await api.get<{ stats: OwnerStats }>(`/api/owners/${ownerId}/stats`, { signal })).stats;
  },
};
