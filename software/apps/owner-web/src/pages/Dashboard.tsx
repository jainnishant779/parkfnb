import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart } from '../components/charts';
import HealthChips from '../components/business/HealthChips';
import { Card, Empty, Grid, LinkBtn, Mini, Minis, Note, Tag, Tile, Tiles, Timeline, TodoList } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useCamera } from '../context/CameraContext';
import { anprJson } from '../lib/anpr';
import { STATUS_LABEL, STATUS_TONE, propertyName, renterName, spaceNumber } from '../lib/business/booking';
import { actionItems, type DayReport } from '../lib/business/dashboard';
import { inRange, rangeBounds, transactionsOf } from '../lib/business/earnings';
import { errorText, isAbort } from '../lib/business/ui';
import { dateTimeLocal, dur, money, pct, todayStr } from '../lib/format';
import type { LotState } from '../lib/lot';
import { usePoll } from '../lib/usePoll';
import { bookingService } from '../services/bookingService';
import { earningsService } from '../services/earningsService';
import type { Booking, OwnerStats } from '../types/business';
import '../styles/business.css';

const TONE_COLOR = { '': 'var(--grey)', green: 'var(--green)', red: 'var(--red)', amber: 'var(--amber)', blue: 'var(--blue)' } as const;

/**
 * The owner's front page, laid out like the operator console's dashboard: a row of numbers, then "Needs your action" and "Today" on the
 * left, what the camera is doing on the right. The owner's own business (earnings, requests, spaces) sits beside it, so the page is
 * useful with no camera linked at all, and still tells the truth when the camera is down.
 */
export default function Dashboard() {
  const { owner, kycStatus } = useAuth();
  const { current, currentInfo, cameras, openViolations, goingOn, loading: camerasLoading, error: cameraError } = useCamera();
  const hasCamera = cameras.length > 0;
  // Only a camera that is in the owner's own list is polled. The remembered selection can name one that is not (another account was
  // signed in here, or the camera was unlinked): asking ANPR for it can only fail, and each failure makes the camera layer renew its passes.
  const polled = currentInfo ? current : null;

  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [bizError, setBizError] = useState<string | null>(null);
  const [state, setState] = useState<LotState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [report, setReport] = useState<DayReport | null>(null);

  const ownerId = owner?.id;

  // the business side, once a minute
  const loadBusiness = useCallback(
    async (signal?: AbortSignal) => {
      if (!ownerId) return;
      const [b, s] = await Promise.allSettled([bookingService.listAll(ownerId, signal), earningsService.stats(ownerId, signal)]);
      if (b.status === 'fulfilled') setBookings(b.value);
      if (s.status === 'fulfilled') setStats(s.value);
      const failed = [b, s].find((r): r is PromiseRejectedResult => r.status === 'rejected' && !isAbort(r.reason));
      setBizError(failed ? errorText(failed.reason, 'Could not load your bookings and earnings.') : null);
    },
    [ownerId],
  );
  usePoll(loadBusiness, 60_000, [loadBusiness]);

  // another camera starts from its own numbers, not the last one's
  useEffect(() => {
    setState(null);
    setReport(null);
    setStateError(null);
  }, [polled]);

  // the camera, every 3 s like the console
  usePoll(
    async (signal) => {
      if (!polled) return;
      try {
        const s = await anprJson<LotState>(polled, '/state', { signal });
        if (s) setState(s);
        setStateError(null);
      } catch (e) {
        if (!isAbort(e)) setStateError(errorText(e, 'Could not reach the camera.'));
      }
    },
    3000,
    [polled],
  );

  // today's occupancy, once a minute
  usePoll(
    async (signal) => {
      if (!polled) return;
      try {
        const today = todayStr();
        const r = await anprJson<DayReport>(polled, '/report', { query: { from: today, to: today }, signal });
        if (r) setReport(r);
      } catch {
        // the chart is an extra; the numbers beside it say what matters
      }
    },
    60_000,
    [polled],
  );

  // ---- the business numbers
  const txns = useMemo(() => transactionsOf(bookings || []), [bookings]);
  const today = rangeBounds('today');
  const week = rangeBounds('week');
  const earnedToday = today ? inRange(txns, today.start, today.end).reduce((s, t) => s + t.kept, 0) : 0;
  const paidToday = today ? inRange(txns, today.start, today.end).filter((t) => t.kept > 0).length : 0;
  const earnedWeek = week ? inRange(txns, week.start, week.end).reduce((s, t) => s + t.kept, 0) : 0;
  const pending = (bookings || []).filter((b) => b.status === 'pending').length;
  const recent = useMemo(
    () => [...(bookings || [])].sort((a, b) => new Date(b.createdAt || b.startTime).getTime() - new Date(a.createdAt || a.startTime).getTime()).slice(0, 5),
    [bookings],
  );
  const bizReady = bookings !== null;
  const v = (n: string) => (bizReady ? n : '…');

  // ---- the camera numbers (the polled state, else the list's)
  const sm = state?.slot_summary || currentInfo?.slotSummary || {};
  const total = sm.total || 0;
  const items = actionItems({
    state, hasCamera, kyc: kycStatus, kycReason: owner?.kycRejectionReason, pendingRequests: pending, openViolations, goingOn,
  });
  const worst = items.length ? items[0].lvl : 'green';

  const cars = report?.cars_per_day.length ? report.cars_per_day[report.cars_per_day.length - 1].cars : 0;

  return (
    <>
      {bizError && <Note tone="bad">{bizError}</Note>}

      <Tiles cols={4}>
        <Tile tone="green" icon="rupee" label="Earned today" value={v(money(earnedToday))} sub={bizReady ? `${paidToday} paid ${paidToday === 1 ? 'booking' : 'bookings'}` : ''} />
        <Tile icon="chart" label="This week" value={v(money(earnedWeek))} sub="since Monday" />
        <Tile tone={pending > 0 ? 'amber' : ''} icon="calendar" label="Booking requests" value={v(String(pending))} sub={pending > 0 ? 'waiting for you' : 'nothing waiting'} />
        <Tile icon="building" label="Spaces" value={stats ? String(stats.totalSpaces) : '…'} sub={stats ? `${stats.activeSpaces} open for booking` : ''} />
      </Tiles>

      {hasCamera ? (
        <>
          {stateError && !state && <Note tone="bad">{stateError}</Note>}
          <Tiles>
            <Tile icon="layers" label="Total bays" value={total} />
            <Tile tone="blue" icon="car" label="Occupied" value={sm.occupied_confirmed || 0} sub={total ? `${pct(((sm.occupied_confirmed || 0) / total) * 100)} of bays` : ''} />
            <Tile tone="green" icon="park" label="Available" value={sm.vacant || 0} sub={total ? `${pct(((sm.vacant || 0) / total) * 100)} of bays` : ''} />
            <Tile tone="green" icon="check" label="Parked correctly" value={sm.parked_correctly || 0} sub={`${(sm.parked_correctly || 0) + (sm.close_to_line || 0) + (sm.over_line || 0)} cars judged`} />
            <Tile tone={sm.over_line ? 'red' : ''} icon="warn" label="Over the line" value={sm.over_line || 0} sub={`${sm.close_to_line || 0} close to a line`} />
            <Tile tone={(sm.uncertain || 0) + (sm.stale || 0) ? 'amber' : ''} icon="help" label="Unclear" value={(sm.uncertain || 0) + (sm.stale || 0)} sub={`${sm.not_judged || 0} parked cars not judged`} />
          </Tiles>
        </>
      ) : camerasLoading ? null : (
        <Card title="Camera">
          <Empty>
            No camera is linked to you yet. Once ParkFNB links one (or you pair it with a code), the bays, the live picture and any
            violations show up here.
          </Empty>
          {cameraError && <Note tone="warn">{cameraError}</Note>}
          <div className="row-actions" style={{ justifyContent: 'center' }}>
            <LinkBtn to="/cameras" variant="primary">Link a camera</LinkBtn>
          </div>
        </Card>
      )}

      <Grid cols={2}>
        <div className="grid">
          <Card title="Needs your action" right={<Tag tone={worst === 'red' ? 'red' : worst === 'amber' ? 'amber' : 'green'}>{items.length ? `${items.length} ${items.length === 1 ? 'thing' : 'things'}` : 'All clear'}</Tag>} flush>
            <TodoList items={items} />
          </Card>

          <Card title="Today">
            <Minis>
              <Mini label="Earned" value={v(money(earnedToday))} sub={bizReady ? `${paidToday} paid` : ''} />
              {hasCamera ? (
                <>
                  <Mini label="Cars parked" value={cars} sub="bays turning occupied" />
                  <Mini label="Average stay" value={report && report.dwell.n ? dur(report.dwell.avg_s) : '–'} sub={report && report.dwell.n ? `${report.dwell.n} full ${report.dwell.n === 1 ? 'stay' : 'stays'}` : 'no full stay yet'} />
                  <Mini label="Busiest" value={report?.peak ? report.peak.label.slice(11, 16) : '–'} sub={report?.peak ? `${pct(report.peak.occupancy_pct)} occupied` : 'no data yet'} />
                </>
              ) : (
                <>
                  <Mini label="This week" value={v(money(earnedWeek))} sub="since Monday" />
                  <Mini label="Requests" value={v(String(pending))} sub="waiting for you" />
                  <Mini label="All time" value={stats ? money(stats.totalRevenue) : '…'} sub="paid bookings" />
                </>
              )}
            </Minis>
            {hasCamera ? (
              report ? (
                report.coverage === 0 ? (
                  <Empty>No readings yet today.</Empty>
                ) : (
                  <>
                    <LineChart buckets={report.occupancy} />
                    {report.coverage < 0.5 && (
                      <Note tone="warn">The camera was seen for only {pct(report.coverage * 100)} of today so far; gaps are drawn as gaps, not as empty bays.</Note>
                    )}
                  </>
                )
              ) : (
                <Empty>Loading today&apos;s occupancy…</Empty>
              )
            ) : (
              <Empty>Link a camera to see how full your lot is through the day.</Empty>
            )}
          </Card>
        </div>

        <div className="grid">
          {hasCamera && (
            <>
              <Card title="Latest activity" flush>
                <Timeline events={state?.events} max={6} />
              </Card>
              <Card title="Camera health" flush>
                {state ? <HealthChips state={state} /> : <Empty>No picture yet</Empty>}
              </Card>
            </>
          )}
          <Card title="Recent bookings" right={<Link className="btn sm" to="/bookings">All bookings</Link>} flush>
            {!bizReady ? (
              <Empty>Loading…</Empty>
            ) : recent.length === 0 ? (
              <Empty>No bookings yet.</Empty>
            ) : (
              <ul className="tl">
                {recent.map((b) => (
                  <li key={b.id}>
                    <div className="ai" style={{ ['--c' as string]: TONE_COLOR[STATUS_TONE[b.status]] }}>{renterName(b).charAt(0).toUpperCase()}</div>
                    <div className="tx">
                      <b><Link className="link" to={`/bookings/${b.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{renterName(b)} · {spaceNumber(b)}</Link></b>
                      <small>{STATUS_LABEL[b.status]} · {money(b.totalAmount)} · {propertyName(b)}</small>
                    </div>
                    <span className="tm">{dateTimeLocal(b.startTime)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Grid>
    </>
  );
}
