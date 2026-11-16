import { useState } from 'react';
import CameraPage from '../components/cameras/CameraPage';
import RangeBar, { todayRange, type Range } from '../components/cameras/RangeBar';
import { ReportState, UnstableNote } from '../components/cameras/ReportBits';
import { PlateCell } from '../components/cameras/bits';
import { failureText } from '../components/cameras/hooks';
import { useReport } from '../components/cameras/useReport';
import { Bar, Btn, Card, Empty, Grow, Note, Tag, Tile, Tiles } from '../components/ui';
import type { CameraInfo } from '../context/CameraContext';
import { anprDownload } from '../lib/anpr';
import { dateTimeOf, dur } from '../lib/format';
import '../styles/cameras.css';

/**
 * Sessions: how long cars stay. Every time a car sat in a bay, with its plate; the averages count only stays seen from start to finish.
 * A "flicker" is the camera losing and finding a car again, not a car coming and going, so it is left out unless asked for.
 */
export default function Sessions() {
  return <CameraPage>{(camera) => <SessionsView camera={camera} />}</CameraPage>;
}

function SessionsView({ camera }: { camera: CameraInfo }) {
  const [range, setRange] = useState<Range>(todayRange);
  const [showShort, setShowShort] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const { report: r, error, loading, reload } = useReport(camera.id, range);

  const downloadCsv = async () => {
    setCsvError(null);
    try {
      await anprDownload(camera.id, '/report.csv', `${camera.id}-stays-${range.from}-${range.to}.csv`, { query: { from: range.from, to: range.to, table: 'stays' } });
    } catch (e) {
      setCsvError(failureText(e, 'Could not download the file'));
    }
  };

  const real = r ? r.stays.filter((s) => !s.flicker) : [];
  const shown = r ? (showShort ? r.stays : real) : [];

  return (
    <>
      <Bar>
        <RangeBar value={range} onChange={setRange} />
        <Grow />
        <label className="bar">
          <input type="checkbox" checked={showShort} onChange={(e) => setShowShort(e.target.checked)} />
          <span>Show the short flickers too</span>
        </label>
      </Bar>
      <ReportState loading={loading} error={error} onRetry={reload} hasReport={Boolean(r)} />
      {csvError ? <Note tone="bad">{csvError}</Note> : null}

      {r ? (
        <>
          <Tiles>
            <Tile tone="blue" icon="car" label="Stays" value={real.length} sub={`${r.dwell.still_parked} still parked · ${r.dwell.cut_short} cut short`} />
            <Tile tone="blue" icon="clock" label="Average stay" value={r.dwell.n ? dur(r.dwell.avg_s) : '–'} sub={r.dwell.n ? `median ${dur(r.dwell.median_s)}` : 'no full stay seen'} />
            <Tile tone="blue" icon="clock" label="Longest stay" value={r.dwell.n ? dur(r.dwell.max_s) : '–'} />
            <Tile tone={r.dwell.flickers ? 'amber' : ''} icon="help" label="Short flickers" value={r.dwell.flickers} sub={`under ${Math.round(r.dwell.min_stay_s / 60)} min, not cars`} />
          </Tiles>
          <UnstableNote dwell={r.dwell} />
          <Card title="Every time a car sat in a bay" flush right={<Btn onClick={() => void downloadCsv()}>CSV</Btn>}>
            {!shown.length ? (
              <Empty>No stay in this period.</Empty>
            ) : (
              <div className="scroll">
                <table className="tbl">
                  <thead>
                    <tr><th>Bay</th><th>Arrived</th><th>Left</th><th>Stayed</th><th>Plate</th><th /></tr>
                  </thead>
                  <tbody>
                    {shown.slice().reverse().slice(0, 500).map((s, i) => (
                      <tr key={`${s.bay}-${s.start}-${i}`}>
                        <td>{s.label}</td>
                        <td>{dateTimeOf(s.start)}</td>
                        <td>{s.open ? 'still parked' : dateTimeOf(s.end)}</td>
                        <td className="num">{dur(s.dwell_s)}</td>
                        <td><PlateCell plate={s.plate} confirmed={s.plate_confirmed} /></td>
                        <td>
                          {s.open ? (
                            <Tag tone="blue">still parked</Tag>
                          ) : s.flicker ? (
                            <span title="Over in seconds: the camera lost and found the car again. Not counted as a car."><Tag tone="amber">flicker</Tag></span>
                          ) : s.interrupted ? (
                            <span title="The camera went offline, it got too dark, the view moved or the server restarted during this stay, so its real length is not known and it is left out of the averages."><Tag tone="amber">cut short</Tag></span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <p className="muted">Times are in {r.timezone}. Showing {r.from === r.to ? r.from : `${r.from} to ${r.to}`}.</p>
        </>
      ) : null}
    </>
  );
}
