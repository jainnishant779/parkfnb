/** What the ANPR service sends for the camera pages (snake_case, as it comes; see ai/anpr/owner_api.py and app.py). */

export interface Arrival {
  id: string;
  bay: string;
  track_id?: number | null;
  arrived: number;
  left: number | null;
  box?: number[] | null;
  frame_size?: number[] | null;
  plate_state?: string;
  plate?: { verdict?: string; width_px?: number; height_px?: number; char_px?: number } | null;
  text?: string | null;
  guess?: string | null;
  confirmed?: boolean;
  source?: string | null;
  reads?: { text?: string }[];
  car_photo?: boolean;
  plate_photo?: boolean;
  initial?: boolean;
}

export interface ArrivalsResponse {
  camera_id: string;
  enabled: boolean;
  arrivals: Arrival[];
}

export interface Vehicle {
  plate: string;
  visits: number;
  first_seen: number;
  last_seen: number;
  total_s: number;
  bays: string[];
  inside: boolean;
  last_bay?: string;
  confirmed?: boolean;
  by_person?: boolean;
}

export interface Violation {
  id: string;
  bay: string;
  label: string;
  type: string;
  opened: number;
  closed: number | null;
  duration_s: number;
  max_crossing_m: number | null;
  side?: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  note: string;
  handled_by: string | null;
  handled_at: number | null;
  detail: string;
  evidence?: boolean;
  evidence_hq?: boolean;
  plate?: string;
  plate_confirmed?: boolean;
}

export interface ViolationsResponse {
  camera_id: string;
  violations: Violation[];
  open_count: number;
  going_on: number;
}

export interface Bucket {
  t: number;
  label: string;
  samples: number;
  occupancy_pct: number | null;
  future?: boolean;
}

export interface Stay {
  bay: string;
  label: string;
  start: number;
  end: number | null;
  dwell_s: number;
  open: boolean;
  flicker: boolean;
  interrupted: boolean;
  counted: boolean;
  plate?: string;
  plate_confirmed?: boolean;
}

export interface Dwell {
  n: number;
  avg_s: number | null;
  median_s: number | null;
  max_s: number | null;
  flickers: number;
  cut_short: number;
  still_parked: number;
  min_stay_s: number;
  unstable_bays: { label: string; flickers: number }[];
}

export interface Report {
  camera_id: string;
  from: string;
  to: string;
  start: number;
  end: number;
  bucket: string;
  timezone: string;
  coverage: number;
  occupancy: Bucket[];
  peak: Bucket | null;
  bays: { bay: string; label: string; samples: number; utilisation_pct: number | null }[];
  stays: Stay[];
  dwell: Dwell;
  cars_per_day: { date: string; cars: number }[];
  quality: { minutes: { correct: number; close_to_line: number; over_line: number }; judged_minutes: number; correct_pct: number | null };
  episodes: { bay: string; label: string; start: number; end: number | null; duration_s: number; ended_by: string; detail: string }[];
  uptime: Record<'offline' | 'dark' | 'moved', { total_s: number; pct: number }> & { period_s: number };
  heat: (number | null)[][];
}

export interface LogRow {
  time: string;
  camera: string;
  event: string;
  bay: string;
  detail: string;
  epoch: number;
  type: string;
}

export interface LogResponse {
  camera_id: string;
  total: number;
  offset: number;
  rows: LogRow[];
}
