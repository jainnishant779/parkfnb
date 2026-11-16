import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BookingActions from '../components/business/BookingActions';
import { Bar, Btn, Card, Empty, Grow, Note, Seg, Tag } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import {
  PAYMENT_LABEL, PAYMENT_TONE, STATUS_LABEL, STATUS_TONE, TABS, haystack, plateOf, propertyName, renterName, renterPhone, spaceNumber, tabOf, vehicleLabel,
  type BookingTab,
} from '../lib/business/booking';
import { addDays, parseDay } from '../lib/business/earnings';
import { errorText, isAbort, useFlash } from '../lib/business/ui';
import { dateTimeLocal, humanize, money } from '../lib/format';
import { usePoll } from '../lib/usePoll';
import { bookingService } from '../services/bookingService';
import type { Booking } from '../types/business';
import '../styles/business.css';

const PAGE_SIZE = 20;
const PAST_STATUSES = ['completed', 'cancelled', 'rejected', 'no_show'] as const;

const EMPTY_TEXT: Record<BookingTab, string> = {
  requests: 'No booking requests waiting for you.',
  upcoming: 'No confirmed bookings coming up.',
  active: 'Nobody is parked under a booking right now.',
  past: 'No past bookings yet.',
};

/** The owner's bookings: tabs by where a booking is in its life, search and date filters, and the decisions right in the row. */
export default function Bookings() {
  const { owner } = useAuth();
  const navigate = useNavigate();
  const [all, setAll] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<BookingTab>('requests');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pastStatus, setPastStatus] = useState('');
  const [page, setPage] = useState(1);
  const [flash, setFlash] = useFlash();

  const ownerId = owner?.id;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!ownerId) return;
      try {
        setAll(await bookingService.listAll(ownerId, signal));
        setError(null);
      } catch (e) {
        if (!isAbort(e)) setError(errorText(e, 'Could not load your bookings.'));
      }
    },
    [ownerId],
  );
  usePoll(load, 30_000, [load]);

  // a new filter starts on the first page
  useEffect(() => setPage(1), [tab, query, from, to, pastStatus]);

  const counts = useMemo(() => {
    const c: Record<BookingTab, number> = { requests: 0, upcoming: 0, active: 0, past: 0 };
    (all || []).forEach((b) => { c[tabOf(b)] += 1; });
    return c;
  }, [all]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const a = parseDay(from);
    const z = parseDay(to);
    let list = (all || []).filter((b) => tabOf(b) === tab);
    if (tab === 'past' && pastStatus) list = list.filter((b) => b.status === pastStatus);
    if (needle) list = list.filter((b) => haystack(b).includes(needle));
    if (a) list = list.filter((b) => new Date(b.startTime) >= a);
    if (z) list = list.filter((b) => new Date(b.startTime) < addDays(z, 1));
    const dir = tab === 'past' ? -1 : 1; // what is coming first comes first; the past, newest first
    return list.sort((x, y) => dir * (new Date(x.startTime).getTime() - new Date(y.startTime).getTime()));
  }, [all, tab, query, from, to, pastStatus]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtered = Boolean(query || from || to || pastStatus);

  const done = (message: string) => {
    setFlash(message);
    void load();
  };

  return (
    <>
      <Bar>
        <Seg options={TABS.map((t) => ({ value: t.value, label: `${t.label}${all ? ` (${counts[t.value]})` : ''}` }))} value={tab} onChange={setTab} />
        <Grow />
        <Btn onClick={() => void load()} disabled={!all && !error}>Refresh</Btn>
      </Bar>
      <Bar>
        <input type="search" placeholder="Search renter, plate, booking number…" aria-label="Search bookings" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: '1 1 240px' }} />
        <input type="date" aria-label="Starts from" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" aria-label="Starts until" value={to} onChange={(e) => setTo(e.target.value)} />
        {tab === 'past' && (
          <select className="fld" aria-label="Status" value={pastStatus} onChange={(e) => setPastStatus(e.target.value)}>
            <option value="">All past</option>
            {PAST_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </select>
        )}
        {filtered && <Btn onClick={() => { setQuery(''); setFrom(''); setTo(''); setPastStatus(''); }}>Clear filters</Btn>}
      </Bar>

      {flash && <Note>{flash}</Note>}
      {error && <Note tone="bad">{error}</Note>}

      <Card flush>
        {!all && !error ? (
          <Empty>Loading bookings…</Empty>
        ) : rows.length === 0 ? (
          <Empty>{filtered ? 'No bookings match these filters.' : EMPTY_TEXT[tab]}</Empty>
        ) : (
          <>
            <div className="scroll">
              <table className="tbl as-cards">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Renter</th>
                    <th>Vehicle</th>
                    <th>Space</th>
                    <th>When</th>
                    <th className="r">Amount</th>
                    <th>Status</th>
                    <th className="r">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((b) => (
                    <tr key={b.id} className="click" onClick={() => navigate(`/bookings/${b.id}`)}>
                      <td data-label="Booking">
                        <Link className="link" to={`/bookings/${b.id}`} onClick={(e) => e.stopPropagation()}>{b.bookingNumber}</Link>
                        <span className="cell-sub">Requested {dateTimeLocal(b.createdAt)}</span>
                      </td>
                      <td data-label="Renter">
                        <span className="cell-main">{renterName(b)}</span>
                        {renterPhone(b) && <span className="cell-sub">+91 {renterPhone(b)}</span>}
                      </td>
                      <td data-label="Vehicle">
                        {plateOf(b) ? <span className="plate-text">{plateOf(b)}</span> : '–'}
                        {vehicleLabel(b) && <span className="cell-sub">{vehicleLabel(b)}</span>}
                      </td>
                      <td data-label="Space">
                        <span className="cell-main">{spaceNumber(b)}</span>
                        <span className="cell-sub">{propertyName(b)}</span>
                      </td>
                      <td className="nowrap" data-label="When">
                        {dateTimeLocal(b.startTime)}
                        <span className="cell-sub">to {dateTimeLocal(b.endTime)} · {b.durationHours} h</span>
                      </td>
                      <td className="r nowrap" data-label="Amount">
                        <span className="cell-main">{money(b.totalAmount)}</span>
                        <span className="cell-sub"><Tag tone={PAYMENT_TONE[b.paymentStatus]}>{PAYMENT_LABEL[b.paymentStatus] || humanize(b.paymentStatus)}</Tag></span>
                      </td>
                      <td data-label="Status"><Tag tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status] || humanize(b.status)}</Tag></td>
                      <td className="r" data-label="Actions"><BookingActions booking={b} onDone={done} small /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="pager">
                <span>{rows.length} bookings</span>
                <span className="grow" />
                <Btn className="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Btn>
                <span>Page {page} of {pages}</span>
                <Btn className="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Btn>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
