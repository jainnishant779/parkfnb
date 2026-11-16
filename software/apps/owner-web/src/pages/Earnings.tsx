import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DailyBars from '../components/business/DailyBars';
import { Bar, Btn, Card, Empty, Grow, Mini, Minis, Note, Seg, Tag, Tile, Tiles } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { PAYMENT_LABEL, PAYMENT_TONE } from '../lib/business/booking';
import {
  MAX_RANGE_DAYS, addDays, dailyTotals, dayKey, daysIn, downloadCsv, inRange, rangeBounds, startOfDay, toCsv, transactionsOf, type RangeKey,
} from '../lib/business/earnings';
import { errorText, isAbort } from '../lib/business/ui';
import { dateTimeLocal, humanize, money } from '../lib/format';
import { usePoll } from '../lib/usePoll';
import { bookingService } from '../services/bookingService';
import { earningsService } from '../services/earningsService';
import type { Booking, EarningsSummary, OwnerStats } from '../types/business';
import '../styles/business.css';

const RANGES: { value: RangeKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];
const PAGE_SIZE = 20;
const PAY_FILTERS = ['paid', 'partially_refunded', 'refunded'] as const;

/**
 * What the owner has earned. Gross only: the backend has no platform-fee or commission field, so nothing is deducted or estimated
 * and there is no "net" figure. The tiles, the chart and the table are all worked out from the same list of bookings, counted on the
 * day each stay ended.
 */
export default function Earnings() {
  const { owner } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<RangeKey>('week');
  const [from, setFrom] = useState(() => dayKey(addDays(startOfDay(new Date()), -6)));
  const [to, setTo] = useState(() => dayKey(new Date()));
  const [query, setQuery] = useState('');
  const [pay, setPay] = useState('');
  const [page, setPage] = useState(1);

  const ownerId = owner?.id;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!ownerId) return;
      const [b, s, e] = await Promise.allSettled([
        bookingService.listAll(ownerId, signal),
        earningsService.stats(ownerId, signal),
        earningsService.summary(ownerId, signal),
      ]);
      if (b.status === 'fulfilled') setBookings(b.value);
      if (s.status === 'fulfilled') setStats(s.value);
      if (e.status === 'fulfilled') setSummary(e.value);
      const failed = [b, s, e].find((r): r is PromiseRejectedResult => r.status === 'rejected' && !isAbort(r.reason));
      setError(failed ? errorText(failed.reason, 'Could not load your earnings.') : null);
    },
    [ownerId],
  );
  usePoll(load, 60_000, [load]);

  useEffect(() => setPage(1), [range, from, to, query, pay]);

  const bounds = useMemo(() => rangeBounds(range, from, to), [range, from, to]);
  const tooLong = bounds ? daysIn(bounds.start, bounds.end) > MAX_RANGE_DAYS : false;
  const usable = bounds && !tooLong ? bounds : null;

  const all = useMemo(() => transactionsOf(bookings || []), [bookings]);
  const inside = useMemo(() => (usable ? inRange(all, usable.start, usable.end) : []), [all, usable]);
  const days = useMemo(() => (usable ? dailyTotals(inside, usable.start, usable.end) : []), [inside, usable]);

  const collected = inside.reduce((sum, t) => sum + t.kept, 0);
  const refunded = inside.reduce((sum, t) => sum + (t.paymentStatus === 'refunded' ? t.amount : t.refund), 0);
  const paidCount = inside.filter((t) => t.kept > 0).length;
  const average = paidCount ? collected / paidCount : 0;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inside.filter((t) => (!pay || t.paymentStatus === pay) && (!needle || `${t.bookingNumber} ${t.renter} ${t.plate} ${t.space}`.toLowerCase().includes(needle)));
  }, [inside, query, pay]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportCsv = () => {
    if (!usable) return;
    const head = ['Date', 'Booking', 'Renter', 'Plate', 'Space', 'Payment', 'Paid', 'Refunded', 'Kept'];
    const lines = rows.map((t) => [
      dateTimeLocal(t.when), t.bookingNumber, t.renter, t.plate, t.space, PAYMENT_LABEL[t.paymentStatus] || t.paymentStatus,
      t.amount, t.paymentStatus === 'refunded' ? t.amount : t.refund, t.kept,
    ]);
    downloadCsv(`parkfnb-earnings-${dayKey(usable.start)}-to-${dayKey(addDays(usable.end, -1))}.csv`, toCsv([head, ...lines]));
  };

  const loading = !bookings && !error;
  return (
    <>
      <Bar>
        <Seg options={RANGES} value={range} onChange={setRange} />
        {range === 'custom' && (
          <>
            <input type="date" aria-label="From" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" aria-label="To" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        <Grow />
        <Btn onClick={exportCsv} disabled={!usable || rows.length === 0}>Export CSV</Btn>
      </Bar>

      {error && <Note tone="bad">{error}</Note>}
      {range === 'custom' && !bounds && <Note tone="warn">Choose a start date and an end date (the end on or after the start).</Note>}
      {tooLong && <Note tone="warn">Choose a range of up to {MAX_RANGE_DAYS} days.</Note>}

      <Tiles>
        <Tile tone="green" icon="rupee" label="Collected" value={loading ? '…' : money(collected)} sub={usable ? `${paidCount} paid ${paidCount === 1 ? 'booking' : 'bookings'}` : ''} />
        <Tile icon="check" label="Average booking" value={loading ? '…' : money(average)} sub="of the paid ones" />
        <Tile tone={refunded > 0 ? 'blue' : ''} icon="clock" label="Refunded" value={loading ? '…' : money(refunded)} sub="given back to renters" />
        <Tile icon="shield" label="Platform fee" value="None yet" sub="These amounts are gross: nothing is deducted" />
      </Tiles>

      <Card title="Earnings per day" right={usable ? <small>{days.length} {days.length === 1 ? 'day' : 'days'}</small> : undefined}>
        {loading ? <Empty>Loading…</Empty> : usable ? <DailyBars days={days} wide /> : <Empty>Pick a range to see the days.</Empty>}
      </Card>

      <Card title="Transactions" flush>
        <div className="bar" style={{ padding: '4px 24px 16px' }}>
          <input type="search" placeholder="Search booking, renter, plate…" aria-label="Search transactions" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: '1 1 220px' }} />
          <select className="fld" aria-label="Payment" value={pay} onChange={(e) => setPay(e.target.value)}>
            <option value="">All payments</option>
            {PAY_FILTERS.map((p) => <option key={p} value={p}>{PAYMENT_LABEL[p]}</option>)}
          </select>
        </div>
        {loading ? (
          <Empty>Loading…</Empty>
        ) : rows.length === 0 ? (
          <Empty>{inside.length ? 'No transactions match.' : 'No paid bookings in this range.'}</Empty>
        ) : (
          <>
            <div className="scroll">
              <table className="tbl as-cards">
                <thead>
                  <tr><th>Date</th><th>Booking</th><th>Renter</th><th>Space</th><th>Payment</th><th className="r">Amount</th></tr>
                </thead>
                <tbody>
                  {shown.map((t) => (
                    <tr key={t.id}>
                      <td className="nowrap" data-label="Date">{dateTimeLocal(t.when)}</td>
                      <td data-label="Booking"><Link className="link" to={`/bookings/${t.id}`}>{t.bookingNumber}</Link></td>
                      <td data-label="Renter">
                        <span className="cell-main">{t.renter}</span>
                        {t.plate && <span className="cell-sub plate-text">{t.plate}</span>}
                      </td>
                      <td data-label="Space">{t.space}</td>
                      <td data-label="Payment"><Tag tone={PAYMENT_TONE[t.paymentStatus]}>{PAYMENT_LABEL[t.paymentStatus] || humanize(t.paymentStatus)}</Tag></td>
                      <td className="r nowrap" data-label="Amount">
                        <span className="cell-main">{money(t.kept)}</span>
                        {t.refund > 0 || t.paymentStatus === 'refunded' ? <span className="cell-sub">of {money(t.amount)} paid</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="pager">
                <span>{rows.length} transactions</span>
                <span className="grow" />
                <Btn className="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Btn>
                <span>Page {page} of {pages}</span>
                <Btn className="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Btn>
              </div>
            )}
          </>
        )}
      </Card>

      <Card title="All time" right={<Link className="btn sm" to="/payouts">Payouts</Link>}>
        <Minis>
          <Mini label="Total revenue" value={stats ? money(stats.totalRevenue) : '–'} sub="all paid bookings" />
          <Mini label="Waiting to be paid" value={summary ? money(summary.pendingEarnings) : '–'} sub="confirmed or active, not yet paid" />
          <Mini label="Completed stays" value={stats ? stats.completedBookings : '–'} sub={stats ? `of ${stats.totalBookings} bookings` : ''} />
          <Mini label="Average booking" value={summary ? money(summary.averageBookingValue) : '–'} sub="paid bookings" />
        </Minis>
      </Card>
    </>
  );
}
