/**
 * Earnings, worked out from the bookings themselves so the tiles, the chart and the table can never disagree.
 *
 * Gross only. The backend has no commission or platform-fee field (a booking has base_price, discount_amount and total_amount), so
 * nothing here deducts, estimates or names a fee, and there is no "net" figure. An amount is counted on the day the stay ended (its
 * check-out, or its end time when no check-out was recorded), in the browser's own time zone.
 */
import type { Booking } from '../../types/business';
import { plateOf, propertyName, renterName, spaceNumber } from './booking';

export interface Txn {
  id: string;
  bookingNumber: string;
  when: Date;
  renter: string;
  plate: string;
  space: string;
  /** what the renter paid */
  amount: number;
  /** what was given back */
  refund: number;
  /** what the owner kept of it: nothing when fully refunded, else the amount less any refund */
  kept: number;
  paymentStatus: Booking['paymentStatus'];
  status: Booking['status'];
}

const MONEY_STATES: Booking['paymentStatus'][] = ['paid', 'refunded', 'partially_refunded'];

/** Bookings that have actually been paid (and perhaps refunded), as money movements. */
export function transactionsOf(bookings: Booking[]): Txn[] {
  return bookings
    .filter((b) => MONEY_STATES.includes(b.paymentStatus))
    .map<Txn>((b) => ({
      id: b.id,
      bookingNumber: b.bookingNumber,
      when: new Date(b.checkOutTime || b.endTime || b.startTime),
      renter: renterName(b),
      plate: plateOf(b),
      space: `${propertyName(b)} · ${spaceNumber(b)}`,
      amount: b.totalAmount || 0,
      refund: b.refundAmount || 0,
      kept: b.paymentStatus === 'refunded' ? 0 : Math.max(0, (b.totalAmount || 0) - (b.refundAmount || 0)),
      paymentStatus: b.paymentStatus,
      status: b.status,
    }))
    .sort((a, b) => b.when.getTime() - a.when.getTime());
}

// ----------------------------------------------------------------------------- ranges

export type RangeKey = 'today' | 'week' | 'month' | 'custom';

export const MAX_RANGE_DAYS = 92;
const DAY_MS = 86_400_000;

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** "YYYY-MM-DD" in the browser's zone (what a date input holds). */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** A date input's value as the start of that local day; null when empty or not a date. */
export function parseDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** [start, end) for a range: today, this week (Monday on), this month, or the chosen dates (both days included). null for an unusable custom range. */
export function rangeBounds(key: RangeKey, from = '', to = '', now = new Date()): { start: Date; end: Date } | null {
  const today = startOfDay(now);
  if (key === 'today') return { start: today, end: addDays(today, 1) };
  if (key === 'week') {
    const back = (today.getDay() + 6) % 7; // Monday = 0
    return { start: addDays(today, -back), end: addDays(today, 1) };
  }
  if (key === 'month') return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: addDays(today, 1) };
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b || b < a) return null;
  return { start: a, end: addDays(b, 1) };
}

export const daysIn = (start: Date, end: Date): number => Math.round((end.getTime() - start.getTime()) / DAY_MS);

export function inRange(txns: Txn[], start: Date, end: Date): Txn[] {
  return txns.filter((t) => t.when >= start && t.when < end);
}

export interface DayTotal {
  key: string;
  label: string;
  total: number;
  count: number;
}

/** One entry per day of the range, empty days included, so the chart shows quiet days as quiet. */
export function dailyTotals(txns: Txn[], start: Date, end: Date): DayTotal[] {
  const days = new Map<string, DayTotal>();
  for (let d = start; d < end; d = addDays(d, 1)) {
    days.set(dayKey(d), { key: dayKey(d), label: d.toLocaleDateString([], { day: 'numeric', month: 'short' }), total: 0, count: 0 });
  }
  for (const t of txns) {
    const slot = days.get(dayKey(t.when));
    if (slot && t.kept > 0) {
      slot.total += t.kept;
      slot.count += 1;
    }
  }
  return [...days.values()];
}

// ----------------------------------------------------------------------------- CSV

/**
 * One CSV cell. A text cell that starts with = + - @ (or a tab or return) would be run as a formula by a spreadsheet, so it is
 * quoted with a leading apostrophe, as the ANPR service does for its own exports. Numbers are written as numbers.
 */
export function csvCell(value: string | number): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The rows as CSV text that opens in Excel: a byte-order mark first, CRLF between rows. */
export function toCsv(rows: (string | number)[][]): string {
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Hand a CSV to the browser as a file. */
export function downloadCsv(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
