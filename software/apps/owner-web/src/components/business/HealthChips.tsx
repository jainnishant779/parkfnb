import { streamView, type LotState } from '../../lib/lot';
import { Chip, Chips } from '../ui';

interface Uplink {
  p50_ms?: number;
  p95_ms?: number;
}
interface SiteCal {
  ready?: boolean;
  good_bays?: number;
  total?: number;
}

/** How the camera feed is doing, as the console's health chips: stream, upload, frame age, speed, light, view. */
export default function HealthChips({ state }: { state: LotState }) {
  const st = streamView(state);
  const up = state.uplink as Uplink | null | undefined;
  const sc = state.site_calibration as SiteCal | null | undefined;
  const age = state.frame_age_s;
  const ms = state.ms_per_frame as number | undefined;
  return (
    <Chips>
      <Chip label="Stream" value={st[0]} level={st[1] || undefined} />
      {up && up.p50_ms !== undefined && <Chip label="Upload" value={`${(up.p50_ms / 1000).toFixed(1)} s`} level={(up.p95_ms || 0) > 4000 ? 'warn' : undefined} />}
      <Chip label="Frame age" value={age === null || age === undefined ? '–' : `${age} s`} level={(age || 0) > 8 ? 'warn' : undefined} />
      <Chip label="Speed" value={`${(state.fps_processed || 0).toFixed(1)} fps`} />
      <Chip label="Latency" value={ms ? `${ms} ms` : '–'} />
      <Chip label="Light" value={state.light === 'low' ? 'Low' : 'OK'} level={state.light === 'low' ? 'warn' : 'ok'} />
      <Chip label="View" value={state.calibration === 'moved' ? 'Moved' : 'In place'} level={state.calibration === 'moved' ? 'warn' : 'ok'} />
      {sc && <Chip label="3D" value={sc.ready ? `Ready · ${sc.good_bays}/${sc.total} bays good` : 'Not calibrated'} level={sc.ready ? 'ok' : 'warn'} />}
    </Chips>
  );
}
