/**
 * What the ANPR service says about a lot, and the words and colours the console uses for it (ported from ai/anpr/static/js/console.js:
 * streamView, bayView, activity). Colours mean one thing everywhere: blue = a car in its bay (nothing to do), amber = near a line or
 * unclear, red = over a line, green = free.
 *
 * ANPR answers are snake_case and are not run through the camelCase transform: they are used as they come, so the field names match
 * the operator console's code and the server's own docs.
 */

export interface Slot {
  id: string;
  status: 'VACANT' | 'OCCUPIED' | 'STALE' | string;
  flag?: string;
  parking?: { verdict?: string; side?: string } | null;
  [key: string]: unknown;
}

export interface SlotSummary {
  total?: number;
  occupied_confirmed?: number;
  vacant?: number;
  parked_correctly?: number;
  close_to_line?: number;
  over_line?: number;
  uncertain?: number;
  stale?: number;
  not_judged?: number;
  [key: string]: unknown;
}

export interface LotEvent {
  t: number;
  type: string;
  bay_id?: string | number;
  track_id?: number;
  status?: string;
  detail?: string;
}

/** /owner/api/cameras/{id}/state */
export interface LotState {
  camera_id: string;
  online: boolean;
  age_s: number | null;
  frame_age_s: number | null;
  fps_processed: number;
  frame_seq: number;
  stream_status: string;
  frozen?: boolean;
  light?: string;
  calibration?: string;
  uplink?: unknown;
  slots: Slot[];
  slot_summary: SlotSummary;
  events: LotEvent[];
  since: number;
  timezone: string;
  [key: string]: unknown;
}

export type Level = 'ok' | 'warn' | 'bad' | '';

const STREAM: Record<string, [string, Level]> = {
  live: ['Live', 'ok'],
  stale: ['Stalled', 'bad'],
  offline: ['Offline', 'bad'],
  error: ['Error', 'bad'],
  not_started: ['Not started', 'warn'],
};

/** One word and a level for the camera's feed: Live, Delayed, Frozen, Offline... */
export function streamView(o: Pick<LotState, 'stream_status' | 'frozen' | 'age_s' | 'frame_age_s'>): [string, Level] {
  const st = STREAM[o.stream_status] || ['–', ''];
  if (o.stream_status !== 'live') return st;
  if (o.frozen) return ['Frozen', 'bad'];
  const recv = o.age_s ?? 0;
  const done = o.frame_age_s ?? 0;
  if (recv > 8) return ['Delayed', 'warn'];
  if (done > 8) return ['Behind', 'warn'];
  return st;
}

export interface BayView {
  cls: 'free' | 'taken' | 'parked' | 'close' | 'unclear' | 'stale';
  word: string;
  tag: 'green' | 'red' | 'amber' | 'blue' | '';
}

/** One word and a colour for what a bay is. */
export function bayView(slot: Slot): BayView {
  const p = slot.parking?.verdict;
  if (slot.status === 'VACANT') return { cls: 'free', word: 'Available', tag: 'green' };
  if (slot.status === 'OCCUPIED') {
    if (slot.flag === 'blocked') return { cls: 'unclear', word: 'Blocked', tag: 'amber' };
    if (p === 'over_line') return { cls: 'taken', word: slot.parking?.side === 'across' ? 'Across bays' : 'Over the line', tag: 'red' };
    if (p === 'close_to_line') return { cls: 'close', word: 'Close to line', tag: 'amber' };
    if (p === 'correct') return { cls: 'parked', word: 'Parked correctly', tag: 'green' };
    return { cls: 'parked', word: 'Occupied', tag: 'blue' };
  }
  if (slot.status === 'STALE') return { cls: 'stale', word: 'No signal', tag: '' };
  return { cls: 'unclear', word: 'Unclear', tag: 'amber' };
}

export interface Activity {
  /** a CSS colour (a variable) */
  c: string;
  /** a one-character glyph */
  g: string;
  t: string;
  s: string;
}

const bayName = (ev: LotEvent): string =>
  ev.bay_id !== undefined && ev.bay_id !== null ? (/^\d+$/.test(String(ev.bay_id)) ? `P${ev.bay_id}` : String(ev.bay_id)) : '';

/** An event from the live feed, as a line a person can read. */
export function activity(ev: LotEvent): Activity {
  const who = bayName(ev);
  switch (ev.type) {
    case 'in': return { c: 'var(--green)', g: '→', t: 'Car came in', s: `Car #${ev.track_id}` };
    case 'out': return { c: 'var(--amber)', g: '←', t: 'Car went out', s: `Car #${ev.track_id}` };
    case 'bay_occupied': return { c: 'var(--red)', g: '●', t: `${who} occupied`, s: 'A car parked' };
    case 'bay_freed': return { c: 'var(--green)', g: '✓', t: `${who} available`, s: 'The car left' };
    case 'parking_over_line': return { c: 'var(--red)', g: '!', t: `${who} parked over the line`, s: ev.detail || '' };
    case 'parking_ok': return { c: 'var(--green)', g: '✓', t: `${who} parked correctly again`, s: '' };
    case 'operator':
      return { c: 'var(--blue)', g: '✎', t: who + (ev.status === 'CLEARED' ? ' answer cleared' : ` marked ${ev.status === 'VACANT' ? 'available' : 'occupied'}`), s: 'Set by an operator' };
    case 'feed_offline': return { c: 'var(--red)', g: '✕', t: 'Camera went offline', s: 'No pictures arriving' };
    case 'feed_online': return { c: 'var(--green)', g: '✓', t: 'Camera back online', s: 'Pictures are arriving again' };
    case 'low_light': return { c: 'var(--amber)', g: '☾', t: 'Too dark to judge bays', s: 'Empty bays show as unclear' };
    case 'light_ok': return { c: 'var(--green)', g: '☀', t: 'Light is back', s: 'Bays are being judged again' };
    case 'camera_moved': return { c: 'var(--amber)', g: '⚠', t: 'Camera view changed', s: 'Bay layout needs a check' };
    case 'camera_ok': return { c: 'var(--green)', g: '✓', t: 'Camera view back in place', s: '' };
    default: return { c: 'var(--grey)', g: '•', t: ev.type, s: '' };
  }
}
