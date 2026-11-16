import { useEffect, useRef, useState } from 'react';
import CameraPage from '../components/cameras/CameraPage';
import RangeBar, { todayRange, type Range } from '../components/cameras/RangeBar';
import { ReportState, UnstableNote } from '../components/cameras/ReportBits';
import { Heat, StackBar } from '../components/cameras/bits';
import { failureText } from '../components/cameras/hooks';
import type { Report } from '../components/cameras/types';
import { useReport } from '../components/cameras/useReport';
import { LineChart } from '../components/charts';
import { Bar, Btn, Card, Empty, Grid, Grow, Kv, Note, Tile, Tiles } from '../components/ui';
import type { CameraInfo } from '../context/CameraContext';
import { anprDownload } from '../lib/anpr';
import { dateTimeOf, dur, pct } from '../lib/format';
import '../styles/cameras.css';

/**
 * Reports: occupancy over time, how busy each bay is, when it is busy, how long cars stay, how well they park, and how long the camera
 * was out. Whole days in the lot's own time zone, up to 31, from the day you got the camera. Each table downloads as CSV.
 */
export default function Reports() {
  return <CameraPage>{(camera) => <ReportsView camera={camera} />}</CameraPage>;
}

const TABLES = ['occupancy', 'bays', 'stays', 'episodes'] as const;

function ReportsView({ camera }: { camera: CameraInfo }) {
  const [range, setRange] = useState<Range>(todayRange);
  const { report: r, error, loading, reload } = useReport(camera.id, range);
  const [menu, setMenu] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  // the Export menu closes on a click outside it or Escape
  useEffect(() => {
    if (!menu) return;
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const download = async (table: (typeof TABLES)[number]) => {
    setMenu(false);
    setCsvError(null);
    try {
      await anprDownload(camera.id, '/report.csv', `${camera.id}-${table}-${range.from}-${range.to}.csv`, { query: { from: range.from, to: range.to, table } });
    } catch (e) {
      setCsvError(failureText(e, 'Could not download the file'));
    }
  };

  return (
    <>
      <Bar>
        <RangeBar value={range} onChange={setRange} />
        <Grow />
        <div className="menu noprint cam-menu-wrap" ref={wrap}>
          <button type="button" className="btn" aria-expanded={menu} onClick={() => setMenu((m) => !m)}
            style={menu ? { background: 'var(--ink)', color: 'var(--on-ink)' } : undefined}>Export ▾</button>
          {menu ? (
            <div className="pop">
              {TABLES.map((t) => <Btn key={t} onClick={() => void download(t)}>CSV: {t}</Btn>)}
              <Btn variant="primary" onClick={() => { setMenu(false); window.print(); }}>Print / save as PDF</Btn>
            </div>
          ) : null}
        </div>
      </Bar>
      <ReportState loading={loading} error={error} onRetry={reload} hasReport={Boolean(r)} />
      {csvError ? <Note tone="bad">{csvError}</Note> : null}
      {r ? <ReportBody r={r} /> : null}
    </>
  );
}

function ReportBody({ r }: { r: Report }) {
  const pcts = r.occupancy.filter((b) => b.occupancy_pct !== null).map((b) => b.occupancy_pct as number);
  const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  const cars = r.cars_per_day.reduce((a, d) => a + d.cars, 0);
  const m = r.quality.minutes;
  const busiest = !r.peak ? '–' : r.bucket === 'day' ? r.peak.label.slice(5, 10) : r.from === r.to ? r.peak.label.slice(11, 16) : r.peak.label.slice(5, 16).replace('T', ' ');

  return (
    <>
      <Tiles>
        <Tile tone={r.coverage < 0.5 ? 'amber' : 'green'} icon="check" label="Camera seen" value={pct(r.coverage * 100)} sub="of the period" />
        <Tile tone="blue" icon="layers" label="Average occupancy" value={avg === null ? '–' : pct(avg)} sub="when the camera saw it" />
        <Tile tone="blue" icon="clock" label="Busiest" value={busiest} sub={r.peak ? `${pct(r.peak.occupancy_pct)} occupied` : 'no data'} />
        <Tile tone="blue" icon="car" label="Cars parked" value={cars} sub={`stayed over ${Math.round(r.dwell.min_stay_s / 60)} min`} />
        <Tile tone="blue" icon="clock" label="Average stay" value={r.dwell.n ? dur(r.dwell.avg_s) : '–'}
          sub={r.dwell.n ? `${r.dwell.n} ${r.dwell.n === 1 ? 'full stay' : 'full stays'}, longest ${dur(r.dwell.max_s)}` : 'no full stay seen'} />
        <Tile tone={r.quality.correct_pct !== null && r.quality.correct_pct < 80 ? 'amber' : 'green'} icon="check" label="Parked correctly"
          value={r.quality.correct_pct === null ? '–' : pct(r.quality.correct_pct)}
          sub={r.quality.judged_minutes ? `of ${Math.round(r.quality.judged_minutes)} judged car-minutes` : 'no car judged yet'} />
      </Tiles>
      {r.coverage < 0.5 ? (
        <Note tone="warn">
          The camera was seen for only {pct(r.coverage * 100)} of this period. Gaps are shown as gaps, never as empty bays, and every figure below counts only what was seen.
        </Note>
      ) : null}
      <UnstableNote dwell={r.dwell} />

      <Card title="Occupancy over time">
        {r.coverage === 0 ? (
          <Empty>No readings in this period.</Empty>
        ) : (
          <LineChart buckets={r.occupancy} wide xlabel={(b) => (r.bucket === 'day' ? b.label.slice(5, 10) : b.label.slice(11, 16))} />
        )}
      </Card>

      <Grid cols={2}>
        <Card title="When it is busy (average % occupied)">{pcts.length ? <Heat grid={r.heat} /> : <Empty>No readings yet.</Empty>}</Card>
        <Card title="Each bay">
          {r.bays.length ? (
            r.bays.map((b) => (
              <div className="hbar" key={b.bay}>
                <span>{b.label}</span>
                <div className="t"><i style={{ width: `${b.utilisation_pct || 0}%` }} /></div>
                <span className="num">{b.utilisation_pct === null ? 'no data' : pct(b.utilisation_pct)}</span>
              </div>
            ))
          ) : (
            <Empty>No bay readings yet.</Empty>
          )}
        </Card>
      </Grid>

      <Grid cols={2}>
        <Card title="Parking quality">
          {r.quality.judged_minutes ? (
            <>
              <StackBar parts={[
                { v: m.correct, color: 'var(--green)', label: 'Correct' },
                { v: m.close_to_line, color: 'var(--amber)', label: 'Close to a line' },
                { v: m.over_line, color: 'var(--red)', label: 'Over a line' },
              ]} />
              <div className="legend">
                Correct {Math.round(m.correct)} min · close to a line {Math.round(m.close_to_line)} min · over a line {Math.round(m.over_line)} min
                (car-minutes, only bays where the 3D camera fit is good)
              </div>
            </>
          ) : (
            <Empty>No parked car could be judged in this period.</Empty>
          )}
        </Card>
        <Card title="Camera uptime">
          <Kv rows={([['Offline', r.uptime.offline], ['Too dark to judge', r.uptime.dark], ['View moved', r.uptime.moved]] as const)
            .map(([k, x]) => [k, `${dur(x.total_s)} (${pct(x.pct, 1)})`] as [string, string])} />
        </Card>
      </Grid>

      <Card title="Over-the-line episodes" flush>
        {!r.episodes.length ? (
          <Empty>None in this period.</Empty>
        ) : (
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr><th>Bay</th><th>From</th><th>To</th><th>Minutes</th><th>Ended by</th><th>What was seen</th></tr>
              </thead>
              <tbody>
                {r.episodes.map((e, i) => (
                  <tr key={`${e.bay}-${e.start}-${i}`}>
                    <td>{e.label}</td>
                    <td>{dateTimeOf(e.start)}</td>
                    <td>{e.end ? dateTimeOf(e.end) : 'now'}</td>
                    <td className="num">{(e.duration_s / 60).toFixed(1)}</td>
                    <td>{e.ended_by}</td>
                    <td>{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="muted">
        Times are in {r.timezone}. Numbers come from the camera&apos;s own log, one reading a minute.
        {r.from !== r.to ? ` Showing ${r.from} to ${r.to}.` : ''}
      </p>
    </>
  );
}
