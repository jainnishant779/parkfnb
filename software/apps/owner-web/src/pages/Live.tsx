import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CameraPage from '../components/cameras/CameraPage';
import LiveWell, { type LiveWellHandle } from '../components/cameras/LiveWell';
import { HealthChips } from '../components/cameras/bits';
import { failureText, plateByBay, useArrivals, useLiveFrame } from '../components/cameras/hooks';
import { Bays, Btn, Card, Empty, Grid, Kv, Note, Tag, Tile, Tiles, Timeline } from '../components/ui';
import { anprJson } from '../lib/anpr';
import type { CameraInfo } from '../context/CameraContext';
import { bayLabel, clockOf, dur, pct } from '../lib/format';
import { bayView, streamView, type LotState, type Slot } from '../lib/lot';
import { usePoll } from '../lib/usePoll';
import '../styles/cameras.css';

/**
 * Live Operations: the picture with the bays drawn on it and the plate of each parked car, the bay grid, the counts, the gate counter
 * and the activity timeline (the console's page). Not here: the operator's "mark this bay available / occupied" controls, which are not
 * the owner's to use.
 */
export default function Live() {
  return <CameraPage>{(camera) => <LiveView camera={camera} />}</CameraPage>;
}

const LEGEND: [string, string][] = [
  ['var(--green)', 'Available'],
  ['var(--blue)', 'Occupied'],
  ['var(--red)', 'Over the line'],
  ['var(--amber)', 'Close to line / unclear'],
  ['var(--grey)', 'No signal'],
];

function sinceText(slot: Slot): string {
  const since = slot.since ? Date.parse(String(slot.since)) / 1000 : NaN;
  const held = slot.held_s as number | null | undefined;
  return (Number.isFinite(since) ? clockOf(since) : '–') + (held !== null && held !== undefined ? ` · ${dur(held)}` : '');
}

function LiveView({ camera }: { camera: CameraInfo }) {
  const [params, setParams] = useSearchParams();
  const selected = params.get('bay');
  const [state, setState] = useState<LotState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const well = useRef<LiveWellHandle>(null);
  const frame = useLiveFrame(camera.id);
  const arrivals = useArrivals(camera.id, 40, 5000);
  const plates = plateByBay(arrivals.data?.arrivals);

  usePoll(
    async (signal) => {
      try {
        const s = await anprJson<LotState>(camera.id, '/state', { signal });
        if (s) {
          setState(s);
          setError(null);
        }
      } catch (e) {
        const text = failureText(e, 'Could not load the camera');
        if (text) setError(text);
      }
    },
    1500,
    [camera.id],
  );

  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('bay', id);
    setParams(next, { replace: true });
  };

  const sm = state?.slot_summary || {};
  const total = sm.total || 0;
  const unclear = (sm.uncertain || 0) + (sm.stale || 0);
  const [word, level] = state ? streamView(state) : ['–', ''];
  const none = !state || state.stream_status === 'not_started' || !state.frames_received;
  const shade = !state
    ? null
    : none
      ? 'Waiting for the first picture from the camera.'
      : state.frozen
        ? "The camera is frozen: it keeps sending the same picture. Showing the last real picture."
        : state.stream_status === 'offline' || state.stream_status === 'error'
          ? 'The camera is offline. Showing the last picture.'
          : state.stream_status === 'stale'
            ? 'Pictures have stopped arriving. Showing the last picture.'
            : null;

  const slots = state?.slots || [];
  const slot = slots.find((x) => String(x.id) === selected);
  const bayPlates: Record<string, { text: string; guess?: boolean }> = {};
  for (const s of slots) {
    const p = s.status === 'OCCUPIED' ? plates[String(s.id)] : undefined;
    if (p) bayPlates[String(s.id)] = { text: p.text, guess: !p.confirmed };
  }

  const fsInfo = state ? (
    <>
      <span className="fs">{camera.label}<b /></span>
      <span className="fs b">Occupied <b>{sm.occupied_confirmed || 0}</b></span>
      <span className="fs g">Available <b>{sm.vacant || 0}</b></span>
      <span className="fs a">Unclear <b>{unclear}</b></span>
      <span className="grow" />
      <span className={`fs ${level === 'ok' ? 'g' : 'r'}`}>{word}<b /></span>
      <span className="fs">{new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}<b /></span>
    </>
  ) : null;

  return (
    <>
      {error && !state ? <Note tone="bad">{error}</Note> : null}
      {error && state ? <Note tone="warn">Could not refresh the camera just now: {error}</Note> : null}
      <Grid cols={2}>
        <div className="grid">
          <section className="card">
            <header>
              <h2>Live camera</h2>
              <Btn onClick={() => well.current?.toggle()}>⛶  Full screen</Btn>
            </header>
            <LiveWell ref={well} src={frame.url} alt="Live view of the lot" shade={shade} fsInfo={fsInfo} plates={plates} />
            <div>{state ? <HealthChips state={state} /> : null}</div>
          </section>
          <Card title="Activity timeline" flush>
            <Timeline events={state?.events} max={12} />
          </Card>
        </div>

        <div className="grid">
          <Tiles cols={4}>
            <Tile icon="layers" label="Total bays" value={total} />
            <Tile tone="blue" icon="car" label="Occupied" value={sm.occupied_confirmed || 0} sub={total ? pct(((sm.occupied_confirmed || 0) / total) * 100) : ''} />
            <Tile tone="green" icon="park" label="Available" value={sm.vacant || 0} sub={total ? pct(((sm.vacant || 0) / total) * 100) : ''} />
            <Tile tone="amber" icon="help" label="Unclear" value={unclear} />
          </Tiles>

          <Card title="Gate tripwire counter">
            {state?.counts ? (
              <div className="tiles t3">
                <Tile tone="green" icon="check" label="In" value={(state.counts as { in: number }).in} />
                <Tile tone="red" icon="check" label="Out" value={(state.counts as { out: number }).out} />
                <Tile icon="car" label="Inside" value={(state.counts as { inside: number }).inside} />
              </div>
            ) : (
              <Empty>No entry line is set for this camera.</Empty>
            )}
          </Card>

          <Card title="Parking zone">
            {state && !slots.length ? <Empty>No bays are drawn for this camera yet. ParkFNB sets them up with you.</Empty> : null}
            <Bays slots={slots} selected={selected} onSelect={select} plates={bayPlates} />
            <div className="legend">
              {LEGEND.map(([c, l]) => (
                <span key={l}><span className="dot" style={{ background: c }} />{l}</span>
              ))}
            </div>
          </Card>

          <Card title="Selected bay">
            {!slot ? (
              <Empty>Tap a bay to see its details.</Empty>
            ) : (
              <BayDetails slot={slot} plate={plates[String(slot.id)]} />
            )}
          </Card>
        </div>
      </Grid>
    </>
  );
}

function BayDetails({ slot, plate }: { slot: Slot; plate?: ReturnType<typeof plateByBay>[string] }) {
  const v = bayView(slot);
  const p = slot.parking as { verdict?: string; clearance?: Record<string, number | null>; crossing_m?: number; side?: string } | null | undefined;
  const rows: [string, React.ReactNode][] = [
    ['Bay', bayLabel(slot.id)],
    ['Status', v.word],
  ];
  if (slot.since) rows.push(['Since', sinceText(slot)]);
  rows.push(['Why', String(slot.reason_text || '–')]);
  if (p && p.verdict && p.verdict !== 'not_judged') {
    if (p.clearance) {
      const text = (['left', 'right'] as const)
        .filter((k) => p.clearance![k] !== undefined && p.clearance![k] !== null)
        .map((k) => `${Number(p.clearance![k]).toFixed(2)} m to the ${k} line`)
        .join(', ');
      rows.push(['Clearance', text || '–']);
    }
    if (p.crossing_m) rows.push(['Over by', `${Number(p.crossing_m).toFixed(2)} m (${p.side || ''})`]);
  }
  if (slot.status !== 'OCCUPIED') rows.push(['Plate', '–']);
  else if (plate) {
    rows.push([
      'Plate',
      <>
        <b className="cam-plate">{plate.text}</b>
        <Tag tone={plate.confirmed ? 'green' : 'amber'}>
          {plate.arrival.source === 'operator' ? 'checked by a person' : plate.confirmed ? `confirmed · ${(plate.arrival.reads || []).length} reads` : 'one read, checking'}
        </Tag>
      </>,
    ]);
  } else rows.push(['Plate', 'not read yet']);
  return <Kv rows={rows} />;
}
