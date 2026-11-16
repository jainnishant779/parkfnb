/** Small pieces several camera pages share: a plate with its state, the heat map, a stacked bar, the camera's health chips. */
import { Chip, Chips, Tag } from '../ui';
import { streamView, type LotState } from '../../lib/lot';
import type { Arrival } from './types';
import '../../styles/cameras.css';

/** The plate, as a person reads it: the letters, then what the system knows about them. */
export function PlateRead({ arrival }: { arrival: Pick<Arrival, 'text' | 'guess' | 'confirmed' | 'source' | 'reads'> }) {
  const text = arrival.text || (arrival.guess ? `${arrival.guess} ?` : '');
  if (!text) return <>–</>;
  const reads = (arrival.reads || []).length;
  return (
    <>
      <b className="cam-plate">{text}</b>
      <br />
      <Tag tone={arrival.confirmed ? 'green' : 'amber'}>
        {arrival.source === 'operator'
          ? 'checked by a person'
          : arrival.confirmed
            ? `confirmed (${reads} reads)`
            : arrival.text
              ? 'one read, checking'
              : 'a guess'}
      </Tag>
    </>
  );
}

/** The plate on a row of a list (a stay, a violation): the letters and "unconfirmed" when only one read supports them. */
export function PlateCell({ plate, confirmed }: { plate?: string; confirmed?: boolean }) {
  if (!plate) return <Tag>not read</Tag>;
  return (
    <>
      <b className="cam-plate">{plate}</b>
      {!confirmed ? <Tag tone="amber">unconfirmed</Tag> : null}
    </>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Average occupancy by weekday and hour: darker blue is busier, grey is no reading. */
export function Heat({ grid }: { grid: (number | null)[][] }) {
  return (
    <div className="heat">
      <div />
      {Array.from({ length: 24 }, (_, h) => <div className="l" key={`h${h}`}>{h % 3 === 0 ? String(h) : ''}</div>)}
      {DAYS.map((d, r) => (
        <div key={d} style={{ display: 'contents' }}>
          <div className="l">{d}</div>
          {Array.from({ length: 24 }, (_, c) => {
            const v = grid[r]?.[c] ?? null;
            return (
              <div key={c} className="c" title={`${d} ${c}:00 · ${v === null ? 'no data' : `${v}% occupied`}`}
                style={v === null ? undefined : { background: `color-mix(in srgb, var(--blue) ${Math.max(8, Math.round(v))}%, var(--grey-soft))` }} />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** One bar split into coloured parts (minutes by meaning). */
export function StackBar({ parts }: { parts: { v: number; color: string; label: string }[] }) {
  const total = parts.reduce((a, p) => a + p.v, 0) || 1;
  return (
    <div className="stack">
      {parts.filter((p) => p.v).map((p) => (
        <i key={p.label} style={{ width: `${(p.v / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.v} min`} />
      ))}
    </div>
  );
}

/** The camera's health in chips: stream, upload, picture age, speed, light, view, 3D fit. */
export function HealthChips({ state }: { state: LotState }) {
  const [word, level] = streamView(state);
  const up = state.uplink as { p50_ms: number; p95_ms: number } | null | undefined;
  const sc = state.site_calibration as { ready?: boolean; good_bays?: number; total?: number } | null | undefined;
  const msPerFrame = state.ms_per_frame as number | undefined;
  const frameAge = state.frame_age_s;
  return (
    <Chips>
      <Chip label="Stream" value={word} level={level || undefined} />
      {up ? <Chip label="Upload" value={`${(up.p50_ms / 1000).toFixed(1)} s`} level={up.p95_ms > 4000 ? 'warn' : undefined} /> : null}
      <Chip label="Picture age" value={frameAge === null || frameAge === undefined ? '–' : `${frameAge} s`} level={frameAge !== null && frameAge !== undefined && frameAge > 8 ? 'warn' : undefined} />
      <Chip label="Speed" value={`${(state.fps_processed || 0).toFixed(1)} fps`} />
      <Chip label="Latency" value={msPerFrame ? `${msPerFrame} ms` : '–'} />
      <Chip label="Light" value={state.light === 'low' ? 'Low' : 'OK'} level={state.light === 'low' ? 'warn' : 'ok'} />
      <Chip label="View" value={state.calibration === 'moved' ? 'Moved' : 'In place'} level={state.calibration === 'moved' ? 'warn' : 'ok'} />
      {sc ? <Chip label="3D" value={sc.ready ? `Ready · ${sc.good_bays}/${sc.total} bays good` : 'Not calibrated'} level={sc.ready ? 'ok' : 'warn'} /> : null}
    </Chips>
  );
}
