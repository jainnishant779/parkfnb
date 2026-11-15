/**
 * Data loading and derivation for the dashboard.
 *
 * The backend has no aggregate-stats endpoint, so every figure here is derived
 * from a real list response — either its pagination `total` (the count the
 * database reports, independent of page size) or the rows on the page.
 *
 * Deliberately absent: any month-over-month or percentage-change figure. The
 * API exposes no historical snapshots to compare against, and a made-up trend
 * is worse than no trend at all.
 */

import { api, requestPaged, ApiError } from './api';

/** Enough rows to draw a meaningful recent-activity view without a huge payload. */
const SAMPLE_LIMIT = 100;

/** Days covered by the bookings chart. */
export const BOOKINGS_WINDOW_DAYS = 14;

export interface BookingRow {
  id: string;
  bookingNumber?: string;
  status: string;
  paymentStatus?: string;
  totalAmount?: number;
  currency?: string;
  createdAt?: string;
  startTime?: string;
  userId?: { firstName?: string; lastName?: string; email?: string } | string | null;
  spaceId?: { title?: string; name?: string } | string | null;
}

export interface UserRow {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  userType?: string;
  createdAt?: string;
}

export interface SpaceRow {
  id: string;
  status?: string;
}

export interface PaymentRow {
  id: string;
  amount?: number;
  currency?: string;
  status?: string;
}

/** A count we could actually measure, or null when the request failed. */
export type Count = number | null;

export interface DashboardData {
  counts: {
    users: Count;
    owners: Count;
    spaces: Count;
    bookings: Count;
    revenue: Count;
  };
  /** Currency reported by the payment rows, so the revenue tile is never mislabelled. */
  revenueCurrency: string | null;
  bookingsByDay: BookingsPoint[];
  spaceStatusBreakdown: Slice[];
  userTypeBreakdown: Slice[];
  recentBookings: BookingRow[];
  recentUsers: UserRow[];
  health: HealthStatus;
  /** Sections that failed to load, so the UI can say so instead of showing zeroes. */
  errors: string[];
}

export interface BookingsPoint {
  /** ISO date (YYYY-MM-DD) used as the x-axis key. */
  date: string;
  label: string;
  confirmed: number;
  pending: number;
}

export interface Slice {
  name: string;
  value: number;
}

export interface HealthStatus {
  apiReachable: boolean;
  database: 'connected' | 'disconnected' | 'unknown';
}

interface HealthResponse {
  status?: string;
  database?: string;
}

/**
 * Runs a request and reports failure instead of throwing, so one dead endpoint
 * degrades a single card rather than blanking the whole dashboard.
 */
async function settle<T>(
  label: string,
  run: () => Promise<T>,
): Promise<{ value: T | null; error: string | null }> {
  try {
    return { value: await run(), error: null };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Request failed';
    return { value: null, error: `${label}: ${message}` };
  }
}

/**
 * Reads the row array out of a list response.
 *
 * List endpoints are not consistent: /api/bookings returns the array as `data`
 * itself, while /api/users, /api/owners, /api/parking-spaces and /api/payments
 * nest it under a named key. Handle both rather than assuming either.
 */
function rowsOf<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const nested = (data as Record<string, unknown>)[key];
    if (Array.isArray(nested)) return nested as T[];
  }
  return [];
}

/** Fetches one page of a list endpoint, returning both its rows and the true total. */
async function fetchList<T>(
  path: string,
  key: string,
  limit: number,
): Promise<{ rows: T[]; total: number }> {
  const { data, meta } = await requestPaged<unknown>(path, { query: { page: 1, limit } });
  const rows = rowsOf<T>(data, key);
  // `meta.total` is the database count; the row count only covers this page.
  return { rows, total: meta?.total ?? rows.length };
}

const dayKey = (date: Date): string => {
  // Local-time key, not toISOString() — the latter shifts the date across the
  // UTC boundary and would file evening bookings under the following day.
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * Buckets bookings into one point per day for the trailing window.
 *
 * Days with no bookings are kept as explicit zeroes so the line reflects real
 * gaps in activity rather than joining across them.
 */
export function groupBookingsByDay(bookings: BookingRow[], days: number): BookingsPoint[] {
  const buckets = new Map<string, BookingsPoint>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    buckets.set(dayKey(date), {
      date: dayKey(date),
      label: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      confirmed: 0,
      pending: 0,
    });
  }

  for (const booking of bookings) {
    if (!booking.createdAt) continue;
    const created = new Date(booking.createdAt);
    if (Number.isNaN(created.getTime())) continue;

    const bucket = buckets.get(dayKey(created));
    if (!bucket) continue; // outside the window

    // The mockup charts Confirmed against Pending. 'active' and 'completed'
    // both began as confirmed bookings, so counting them as confirmed keeps
    // the series from collapsing as bookings progress through their lifecycle.
    if (booking.status === 'pending') bucket.pending += 1;
    else if (['confirmed', 'active', 'completed'].includes(booking.status)) bucket.confirmed += 1;
  }

  return [...buckets.values()];
}

/** Counts occurrences of a field, producing donut slices sorted largest first. */
function tally<T>(rows: T[], pick: (row: T) => string | undefined): Slice[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = pick(row);
    if (!raw) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/** Checks the API and its database. Unlike the mockup, only what we can measure. */
async function loadHealth(): Promise<HealthStatus> {
  try {
    const result = await api.get<HealthResponse>('/health', { anonymous: true });
    return {
      apiReachable: true,
      database: result.database === 'connected' ? 'connected' : 'disconnected',
    };
  } catch {
    // If /health itself is unreachable we know nothing about the database.
    return { apiReachable: false, database: 'unknown' };
  }
}

export async function loadDashboard(): Promise<DashboardData> {
  const [users, owners, spaces, bookings, payments, health] = await Promise.all([
    settle('Users', () => fetchList<UserRow>('/api/users', 'users', SAMPLE_LIMIT)),
    settle('Owners', () => fetchList<unknown>('/api/owners', 'owners', 1)),
    settle('Parking spaces', () =>
      fetchList<SpaceRow>('/api/parking-spaces', 'spaces', SAMPLE_LIMIT),
    ),
    settle('Bookings', () => fetchList<BookingRow>('/api/bookings', 'bookings', SAMPLE_LIMIT)),
    settle('Payments', () => fetchList<PaymentRow>('/api/payments', 'payments', SAMPLE_LIMIT)),
    loadHealth(),
  ]);

  const bookingRows = bookings.value?.rows ?? [];
  const userRows = users.value?.rows ?? [];
  const spaceRows = spaces.value?.rows ?? [];
  const paymentRows = payments.value?.rows ?? [];

  // Revenue is summed over the payments actually fetched, so it is a sample
  // rather than lifetime GBV whenever there are more than SAMPLE_LIMIT rows.
  // The card labels it accordingly — there is no totals endpoint to ask.
  const completedPayments = paymentRows.filter((payment) =>
    ['completed', 'succeeded', 'paid', 'captured'].includes(payment.status ?? ''),
  );
  const revenue = payments.value
    ? completedPayments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0)
    : null;

  return {
    counts: {
      users: users.value?.total ?? null,
      owners: owners.value?.total ?? null,
      spaces: spaces.value?.total ?? null,
      bookings: bookings.value?.total ?? null,
      revenue,
    },
    revenueCurrency: completedPayments.find((payment) => payment.currency)?.currency ?? null,
    bookingsByDay: bookings.value ? groupBookingsByDay(bookingRows, BOOKINGS_WINDOW_DAYS) : [],
    spaceStatusBreakdown: tally(spaceRows, (space) => space.status),
    userTypeBreakdown: tally(userRows, (user) => user.userType),
    // Both lists come back newest-first from the API; take the head for the panels.
    recentBookings: bookingRows.slice(0, 6),
    recentUsers: userRows.slice(0, 5),
    health,
    errors: [users, owners, spaces, bookings, payments]
      .map((result) => result.error)
      .filter((error): error is string => error !== null),
  };
}
