import { humanize } from './format';

/**
 * Colour for every status value the backend can emit, across four enums:
 *
 *   Booking.status          pending confirmed active completed cancelled rejected no_show
 *   Booking.payment_status  pending paid refunded partially_refunded failed
 *   Payment.payment_status  pending processing succeeded failed refunded partially_refunded
 *   Refund.status           pending processing completed failed cancelled
 *
 * They overlap, so one map covers all four. The palette follows the panel's
 * convention: amber for waiting, green for good, blue for finished, red for
 * failure, grey for a no-show.
 */
const STATUS_STYLES: Record<string, string> = {
  // Waiting on something.
  pending: 'bg-amber-50 text-amber-700 ring-amber-100',
  processing: 'bg-amber-50 text-amber-700 ring-amber-100',

  // Went well.
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  succeeded: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-100',

  // In progress right now — the accent, so an admin can spot live stays.
  active: 'bg-teal/10 text-teal ring-teal/20',

  // Finished and closed out.
  completed: 'bg-sky-50 text-sky-700 ring-sky-100',

  // Money went back. Distinct from a failure: the booking did pay first.
  refunded: 'bg-violet-50 text-violet-700 ring-violet-100',
  partially_refunded: 'bg-violet-50 text-violet-700 ring-violet-100',

  // Did not go through.
  cancelled: 'bg-red-50 text-red-700 ring-red-100',
  rejected: 'bg-red-50 text-red-700 ring-red-100',
  failed: 'bg-red-50 text-red-700 ring-red-100',

  // Booked, paid for, never turned up.
  no_show: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/**
 * A status value the map does not cover still renders — as neutral grey with
 * its raw label — so a future enum addition shows up as itself rather than
 * silently disappearing from the table.
 */
export default function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>;

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 ring-slate-200'
      }`}
    >
      {humanize(status)}
    </span>
  );
}
