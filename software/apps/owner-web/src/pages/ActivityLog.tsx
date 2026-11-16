import { useCallback, useEffect, useRef, useState } from 'react';
import CameraPage from '../components/cameras/CameraPage';
import { failureText } from '../components/cameras/hooks';
import type { LogResponse, LogRow } from '../components/cameras/types';
import { Bar, Btn, Card, Empty, Grow, Note } from '../components/ui';
import type { CameraInfo } from '../context/CameraContext';
import { anprDownload, anprJson } from '../lib/anpr';
import { bayLabel, dateTimeOf } from '../lib/format';
import '../styles/cameras.css';

/**
 * Activity log: everything the camera noticed, newest first (bays turning occupied or free, cars at the gate, the camera going offline or
 * too dark, a car over the line). From the day you got the camera, up to 31 days back; downloads as CSV.
 */
export default function ActivityLog() {
  return <CameraPage>{(camera) => <LogView camera={camera} />}</CameraPage>;
}

const PAGE = 200;
const DAYS: [string, string][] = [['1', 'Last 24 hours'], ['3', 'Last 3 days'], ['7', 'Last 7 days'], ['14', 'Last 14 days'], ['31', 'Last 31 days']];
const KINDS: [string, string][] = [
  ['in,out,bay_occupied,bay_freed,bay_initial,feed_offline,feed_online,low_light,light_ok,camera_moved,camera_ok,operator,parking_over_line,parking_ok', 'All events'],
  ['', 'Everything, with the minute-by-minute samples'],
  ['bay_occupied,bay_freed,bay_initial', 'Bays turning occupied / free'],
  ['in,out', 'Cars at the gate'],
  ['feed_offline,feed_online,low_light,light_ok,camera_moved,camera_ok', 'Camera and light problems'],
  ['operator,operator_violation', 'Answers by people'],
  ['sample', 'Minute-by-minute occupancy'],
];

function LogView({ camera }: { camera: CameraInfo }) {
  const [days, setDays] = useState('7');
  const [kind, setKind] = useState(KINDS[0][0]);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const fetchPage = useCallback(
    async (offset: number): Promise<LogResponse | null> => anprJson<LogResponse>(camera.id, '/log', { query: { days, kind, limit: PAGE, offset } }),
    [camera.id, days, kind],
  );

  const reload = useCallback(() => {
    const mine = ++latest.current; // a slow answer for an older filter must not replace a newer one
    setLoading(true);
    setError(null);
    fetchPage(0)
      .then((r) => {
        if (mine !== latest.current || !r) return;
        setRows(r.rows);
        setTotal(r.total);
        setLoading(false);
      })
      .catch((e) => {
        if (mine !== latest.current) return;
        const text = failureText(e, 'Could not load the log');
        if (text) {
          setError(text);
          setLoading(false);
        }
      });
  }, [fetchPage]);

  useEffect(() => reload(), [reload]);

  const more = async () => {
    const mine = latest.current;
    setLoading(true);
    try {
      const r = await fetchPage(rows.length);
      if (mine !== latest.current || !r) return;
      setRows((old) => [...old, ...r.rows]);
      setTotal(r.total);
    } catch (e) {
      const text = failureText(e, 'Could not load more');
      if (text) setError(text);
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    try {
      await anprDownload(camera.id, '/log.csv', `parkfnb-${camera.id}-log.csv`, { query: { days, kind } });
    } catch (e) {
      setError(failureText(e, 'Could not download the file'));
    }
  };

  return (
    <>
      <Bar>
        <select className="fld" aria-label="Period" value={days} onChange={(e) => setDays(e.target.value)}>
          {DAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="fld" aria-label="Kind of event" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
        </select>
        <Grow />
        <Btn onClick={reload} disabled={loading}>Refresh</Btn>
        <Btn onClick={() => void download()}>CSV</Btn>
      </Bar>
      {error ? <Note tone="bad">{error}</Note> : null}
      <Card title={loading && !rows.length ? 'Activity' : `${total} ${total === 1 ? 'event' : 'events'}`} flush>
        {loading && !rows.length ? (
          <Empty>Loading…</Empty>
        ) : !rows.length ? (
          <Empty>Nothing was logged in this period.</Empty>
        ) : (
          <>
            <div className="scroll">
              <table className="tbl">
                <thead>
                  <tr><th>Time</th><th>Event</th><th>Bay</th><th>Detail</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.epoch}-${i}`}>
                      <td className="cam-nowrap">{dateTimeOf(r.epoch)}</td>
                      <td>{r.event}</td>
                      <td>{r.bay ? bayLabel(r.bay) : ''}</td>
                      <td>{r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length < total ? (
              <div className="cam-more">
                <Btn onClick={() => void more()} disabled={loading}>{loading ? 'Loading…' : `Show ${Math.min(PAGE, total - rows.length)} more (${rows.length} of ${total})`}</Btn>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
