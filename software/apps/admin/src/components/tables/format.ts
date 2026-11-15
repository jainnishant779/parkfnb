/**
 * Formatting helpers shared by the Users, Bookings and Payments tables.
 *
 * The rule running through all of them: show what the record actually says.
 * A missing field renders an em dash, never "undefined", "N/A" or an invented
 * stand-in — an admin has to be able to tell "we do not have this" apart from
 * "this is the value".
 */

/** What every table cell shows when the backend has no value for it. */
export const EMPTY = '—';

/** Turns snake_case API enums into readable labels ("no_show" -> "No show"). */
export const humanize = (value: string): string => {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/**
 * Formats an amount in the currency the record itself carries.
 *
 * Deliberately takes the code rather than defaulting to INR. Booking and
 * Payment both default `currency` to 'USD' on the backend while the mobile
 * apps quote INR, so rows genuinely disagree with each other. Rendering each
 * row's own code keeps that mismatch visible instead of papering over it.
 * A record with no code at all is labelled as such rather than guessed.
 */
export const formatMoney = (amount: number | undefined | null, currency?: string | null): string => {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) return EMPTY;
  if (!currency) return `${amount.toLocaleString()} (no currency)`;

  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Intl throws on a code it does not recognise; show the raw code instead.
    return `${code} ${amount.toLocaleString()}`;
  }
};

const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const DATE_ONLY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const TIME_ONLY = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

const parse = (iso: string | undefined | null): Date | null => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateTime = (iso: string | undefined | null): string => {
  const date = parse(iso);
  return date ? DATE_TIME.format(date) : EMPTY;
};

export const formatDate = (iso: string | undefined | null): string => {
  const date = parse(iso);
  return date ? DATE_ONLY.format(date) : EMPTY;
};

const isSameCalendarDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Renders a booking's window as two lines.
 *
 * A same-day booking can safely collapse the end to a bare clock time, but a
 * multi-day one must repeat the date. The owner app shipped a bug that showed
 * "4:00 PM – 4:00 PM" for a booking spanning two days, which reads as a
 * zero-length stay; the whole point of splitting this out is to never do that.
 */
export const formatBookingWindow = (
  startIso: string | undefined | null,
  endIso: string | undefined | null,
): { start: string; end: string; spansDays: boolean } => {
  const start = parse(startIso);
  const end = parse(endIso);

  if (!start && !end) return { start: EMPTY, end: EMPTY, spansDays: false };
  if (!start || !end) {
    return {
      start: start ? DATE_TIME.format(start) : EMPTY,
      end: end ? DATE_TIME.format(end) : EMPTY,
      spansDays: false,
    };
  }

  const sameDay = isSameCalendarDay(start, end);
  return {
    start: DATE_TIME.format(start),
    end: sameDay ? TIME_ONLY.format(end) : DATE_TIME.format(end),
    spansDays: !sameDay,
  };
};

/** "2h 30m" from the booking's stored duration_hours (a decimal number of hours). */
export const formatDuration = (hours: number | undefined | null): string => {
  if (hours === undefined || hours === null || !Number.isFinite(hours)) return EMPTY;

  const totalMinutes = Math.round(hours * 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const remainingHours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (remainingHours > 0) parts.push(`${remainingHours}h`);
  // Keep minutes when they are the only unit, so a 20-minute stay is not "".
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
};

/**
 * Mongoose relations arrive populated as an object or unpopulated as a bare id
 * string, and a `.populate()` against a deleted document yields null. Narrowing
 * once here keeps every call site from repeating the three-way check.
 */
export const populated = <T extends object>(relation: T | string | null | undefined): T | null =>
  relation && typeof relation === 'object' ? relation : null;

/** A person's display name from whatever the populated user document carries. */
export const personName = (
  person: { firstName?: string; lastName?: string; email?: string; phone?: string } | null,
): string => {
  if (!person) return EMPTY;
  const full = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  return full || person.email || person.phone || EMPTY;
};
