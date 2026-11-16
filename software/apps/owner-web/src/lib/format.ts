/**
 * Number, time and label helpers shared by the pages.
 *
 * Every time on a camera page is the lot's time (the ANPR server's ANPR_TIMEZONE, sent as `timezone`), not the time of whatever laptop
 * is looking: reports count days in it, so a clock in another zone would put a violation under the wrong day. A zone name the browser
 * does not know falls back to the browser's own.
 */

let lotTimezone: string | null = null;

export function setLotTimezone(tz: string | null | undefined): void {
  lotTimezone = tz || null;
}

function withZone(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  if (!lotTimezone) return options;
  try {
    new Intl.DateTimeFormat([], { timeZone: lotTimezone });
    return { ...options, timeZone: lotTimezone };
  } catch {
    return options; // the browser's own
  }
}

const two = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** "5 min", "2 h 05 min". */
export function dur(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '–';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${two(m % 60)} min`;
}

/** The time of an epoch (seconds), "3:05 pm", in the lot's zone. */
export function clockOf(epoch: number): string {
  return new Date(epoch * 1000).toLocaleTimeString([], withZone({ hour: 'numeric', minute: '2-digit' }));
}

/** "12 Nov, 3:05 pm" in the lot's zone. */
export function dateTimeOf(epoch: number | null | undefined): string {
  if (epoch === null || epoch === undefined) return '–';
  const d = new Date(epoch * 1000);
  return `${d.toLocaleDateString([], withZone({ day: 'numeric', month: 'short' }))}, ${clockOf(epoch)}`;
}

/** "YYYY-MM-DD" of the lot's day, `n` days ago. */
export function dayAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  try {
    const s = d.toLocaleDateString('en-CA', withZone({ year: 'numeric', month: '2-digit', day: '2-digit' }));
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  } catch {
    // below
  }
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export const todayStr = (): string => dayAgo(0);

/** "P3" for a numbered bay, the name otherwise. */
export const bayLabel = (id: string | number): string => (/^\d+$/.test(String(id)) ? `P${id}` : String(id));

export function pct(v: number | null | undefined, digits = 0): string {
  return v === null || v === undefined ? '–' : `${(+v).toFixed(digits)}%`;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
/** ₹1,234.50 */
export const money = (n: number | null | undefined): string => inr.format(Number.isFinite(n as number) ? (n as number) : 0);

/** A date as the owner reads it, in the browser's zone (bookings and earnings are not the lot's clock). */
export function dateOf(iso: string | number | Date | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTimeLocal(iso: string | number | Date | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '–'
    : d.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** "snake_case_word" to "Snake case word". */
export function humanize(value: string | null | undefined): string {
  if (!value) return '–';
  const s = value.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
