import { useRef, useState } from 'react';
import CameraPage from '../components/cameras/CameraPage';
import RangeBar, { type Range } from '../components/cameras/RangeBar';
import ViolationDrawer, { VIOLATION_TYPE } from '../components/cameras/ViolationDrawer';
import { PlateCell } from '../components/cameras/bits';
import { failureText } from '../components/cameras/hooks';
import AnprImage from '../components/cameras/AnprImage';
import type { Violation, ViolationsResponse } from '../components/cameras/types';
import { Bar, Btn, Card, Empty, Grow, Note, Seg, Tag } from '../components/ui';
import { useCamera, type CameraInfo } from '../context/CameraContext';
import { anprDownload, anprJson } from '../lib/anpr';
import { dateTimeOf, dur } from '../lib/format';
import { usePoll } from '../lib/usePoll';
import '../styles/cameras.css';

type StatusFilter = 'open' | 'resolved' | 'dismissed' | '';

/**
 * Violations: cars over the line or past the overstay limit, with the picture kept for each. Open one to see it, then resolve it
 * (it was real), dismiss it (a false alarm) or reopen it, with a note. The red number on the menu follows what you do here at once.
 */
export default function Violations() {
  return <CameraPage>{(camera) => <ViolationsView camera={camera} />}</CameraPage>;
}

function ViolationsView({ camera }: { camera: CameraInfo }) {
  const { setOpenViolations } = useCamera();
  const [status, setStatus] = useState<StatusFilter>('open');
  const [type, setType] = useState('');
  const [range, setRange] = useState<Range>({ from: '', to: '' });
  const [result, setResult] = useState<{ key: string; data: ViolationsResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Violation | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const latest = useRef(0);
  const filterKey = JSON.stringify([status, type, range.from, range.to]);
  const query = { status, type, from: range.from, to: range.to };

  const load = async (signal?: AbortSignal) => {
    const mine = ++latest.current; // a slow answer for an older filter must not paint over a newer one
    try {
      const r = await anprJson<ViolationsResponse>(camera.id, '/violations', { query, signal });
      if (!r || mine !== latest.current) return;
      setResult({ key: filterKey, data: r });
      setError(null);
      setOpenViolations(r.open_count, r.going_on);
    } catch (e) {
      if (mine !== latest.current) return;
      const text = failureText(e, 'Could not load the violations');
      if (text) setError(text);
    }
  };

  usePoll((signal) => load(signal), 30_000, [camera.id, filterKey]);

  const downloadCsv = async () => {
    setCsvError(null);
    try {
      await anprDownload(camera.id, '/violations.csv', `${camera.id}-violations.csv`, { query });
    } catch (e) {
      setCsvError(failureText(e, 'Could not download the file'));
    }
  };

  const data = result && result.key === filterKey ? result.data : null;

  return (
    <>
      <Bar>
        <Seg<StatusFilter>
          options={[{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }, { value: 'dismissed', label: 'Dismissed' }, { value: '', label: 'All' }]}
          value={status}
          onChange={setStatus}
        />
        <select className="fld" aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="over_line">Over the line</option>
          <option value="overstay">Overstay</option>
        </select>
        <RangeBar value={range} onChange={setRange} allowAll />
        <Grow />
        <Btn onClick={() => void downloadCsv()}>CSV</Btn>
      </Bar>
      {csvError ? <Note tone="bad">{csvError}</Note> : null}
      {error ? <Note tone="bad">{error}</Note> : null}

      {!data ? (
        error ? null : <Empty>Loading…</Empty>
      ) : (
        <Card title={`${data.violations.length} ${data.violations.length === 1 ? 'violation' : 'violations'}`} flush>
          {!data.violations.length ? (
            <Empty>{status === 'open' ? 'Nothing open. Every violation has been dealt with.' : 'No violation matches.'}</Empty>
          ) : (
            <div className="scroll">
              <table className="tbl">
                <thead>
                  <tr><th /><th>Status</th><th>Bay</th><th>Car</th><th>What</th><th>Opened</th><th>Lasted</th><th>Over by</th></tr>
                </thead>
                <tbody>
                  {data.violations.map((v) => (
                    <tr key={v.id} className="click" tabIndex={0} onClick={() => setSelected(v)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(v); } }}>
                      <td>
                        {v.evidence ? (
                          <AnprImage cameraId={camera.id} path={`/evidence/${encodeURIComponent(v.id)}.jpg`} alt={`Picture of ${v.label}`}
                            className="cam-thumb vio" placeholder={(s) => <span className="cam-ph vio">{s === 'missing' ? 'no picture' : '…'}</span>} />
                        ) : null}
                      </td>
                      <td><Tag tone={v.status === 'open' ? 'red' : v.status === 'resolved' ? 'green' : ''}>{v.status}</Tag></td>
                      <td className="cam-nowrap">{v.label}</td>
                      <td><PlateCell plate={v.plate} confirmed={v.plate_confirmed} /></td>
                      <td>{(VIOLATION_TYPE[v.type] || v.type) + (v.detail ? `: ${v.detail}` : '')}</td>
                      <td>{dateTimeOf(v.opened)}</td>
                      <td className="num">{v.closed ? dur(v.duration_s) : `${dur(v.duration_s)} so far`}</td>
                      <td className="num">{v.max_crossing_m ? `${v.max_crossing_m.toFixed(2)} m` : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {selected ? (
        <ViolationDrawer
          key={selected.id}
          cameraId={camera.id}
          violation={selected}
          onClose={() => setSelected(null)}
          onSaved={(open) => {
            setSelected(null);
            if (open !== undefined) setOpenViolations(open);
            void load();
          }}
        />
      ) : null}
    </>
  );
}
