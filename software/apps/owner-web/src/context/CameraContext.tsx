import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { anprCameras, anprJson, getGrantError, grantedCameras, onGrants, refreshGrants, startGrants } from '../lib/anpr';
import { setLotTimezone } from '../lib/format';
import { usePoll } from '../lib/usePoll';
import type { SlotSummary } from '../lib/lot';

/**
 * The owner's cameras, which one the pages are showing, and the little that every page's frame needs about it (its status, how many
 * violations are open). The same shape as the operator console's shell: a camera picker, a status pill, a badge on Violations.
 *
 * Which cameras are the owner's comes from the backend (the access grant); what each is doing comes from the ANPR service, every 20 s.
 * The chosen camera is remembered in this browser under the console's own key.
 */

const CAM_KEY = 'pf.cam';

interface RawRow {
  id: string;
  bays: number;
  online: boolean;
  stream_status: string;
  frame_age_s: number | null;
  age_s: number | null;
  fps: number | null;
  frozen: boolean;
  light: string;
  calibration: string;
  slot_summary: SlotSummary | null;
  known: boolean;
  name: string;
  zone: string;
  overstay_h: number;
  since: number;
}

export interface CameraInfo {
  id: string;
  /** the name an operator gave it, else the property it is on, else its ID */
  label: string;
  name: string;
  propertyName: string | null;
  zone: string;
  /** false: the ANPR server has not heard from this camera yet */
  known: boolean;
  since: number;
  online: boolean;
  streamStatus: string;
  frameAgeS: number | null;
  ageS: number | null;
  frozen: boolean;
  light: string;
  calibration: string;
  bays: number;
  overstayH: number;
  slotSummary: SlotSummary | null;
}

interface CameraContextValue {
  cameras: CameraInfo[];
  current: string | null;
  currentInfo: CameraInfo | null;
  setCurrent: (id: string) => void;
  /** the lot's time zone, as ANPR_TIMEZONE on the server says */
  timezone: string | null;
  loading: boolean;
  /** why the cameras could not be had (a grant refused, a server down), or null */
  error: string | null;
  refresh: () => Promise<void>;
  openViolations: number;
  goingOn: number;
  /** a page that changes violations calls this to update the badge at once */
  setOpenViolations: (open: number, goingOn?: number) => void;
}

const CameraContext = createContext<CameraContextValue | null>(null);

function savedCamera(): string | null {
  try {
    return localStorage.getItem(CAM_KEY);
  } catch {
    return null;
  }
}

export function CameraProvider({ children }: { children: ReactNode }) {
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [current, setCurrentState] = useState<string | null>(savedCamera);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openViolations, setOpen] = useState(0);
  const [goingOn, setGoingOn] = useState(0);
  const [grantVersion, setGrantVersion] = useState(0);

  // Passes: ask for them once signed in, and look again whenever they change.
  useEffect(() => {
    startGrants();
    return onGrants(() => setGrantVersion((v) => v + 1));
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    const granted = grantedCameras();
    if (!granted.length) {
      setCameras([]);
      setError(getGrantError());
      setLoading(false);
      return;
    }
    try {
      const { timezone: tz, cameras: rows } = await anprCameras<RawRow>(signal);
      const byId = new Map(rows.map((r) => [r.id, r]));
      setLotTimezone(tz);
      setTimezone(tz);
      setCameras(
        granted.map((g) => {
          const r = byId.get(g.cameraId);
          const name = r?.name || g.name || '';
          return {
            id: g.cameraId,
            label: name && name !== g.cameraId ? name : g.propertyName || g.cameraId,
            name,
            propertyName: g.propertyName,
            zone: r?.zone || '',
            known: Boolean(r?.known),
            since: r?.since ?? 0,
            online: Boolean(r?.online),
            streamStatus: r?.stream_status || 'not_started',
            frameAgeS: r?.frame_age_s ?? null,
            ageS: r?.age_s ?? null,
            frozen: Boolean(r?.frozen),
            light: r?.light || 'ok',
            calibration: r?.calibration || 'ok',
            bays: r?.bays ?? 0,
            overstayH: r?.overstay_h ?? 0,
            slotSummary: r?.slot_summary ?? null,
          };
        }),
      );
      setError(null);
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'ABORTED')) setError(e instanceof ApiError ? e.message : 'Could not load your cameras');
    } finally {
      setLoading(false);
    }
  }, []);

  usePoll((signal) => load(signal), 20_000, [grantVersion]);

  // The selection: the saved camera if it is still the owner's, else the first.
  useEffect(() => {
    if (!cameras.length) return;
    if (!current || !cameras.some((c) => c.id === current)) setCurrentState(cameras[0].id);
  }, [cameras, current]);

  const setCurrent = useCallback((id: string) => {
    setCurrentState(id);
    setOpen(0);
    setGoingOn(0);
    try {
      localStorage.setItem(CAM_KEY, id);
    } catch {
      // private mode
    }
  }, []);

  // The badge on Violations: how many are open for the chosen camera.
  usePoll(
    async (signal) => {
      // only for a camera that is in the owner's list: a stale saved selection must not be asked about
      if (!current || !cameras.some((c) => c.id === current)) return;
      try {
        const r = await anprJson<{ open_count: number; going_on: number }>(current, '/violations', { query: { status: 'open' }, signal });
        if (r) {
          setOpen(r.open_count || 0);
          setGoingOn(r.going_on || 0);
        }
      } catch {
        // the badge is a hint; the Violations page reports a real failure
      }
    },
    30_000,
    [current, grantVersion],
  );

  const refresh = useCallback(async () => {
    await refreshGrants(true); // a person's own action (pairing, unpairing): do not wait out the minimum gap
    await load();
  }, [load]);

  const value = useMemo<CameraContextValue>(
    () => ({
      cameras,
      current,
      currentInfo: cameras.find((c) => c.id === current) ?? null,
      setCurrent,
      timezone,
      loading,
      error,
      refresh,
      openViolations,
      goingOn,
      setOpenViolations: (open, going) => {
        setOpen(open);
        if (going !== undefined) setGoingOn(going);
      },
    }),
    [cameras, current, setCurrent, timezone, loading, error, refresh, openViolations, goingOn],
  );

  return <CameraContext.Provider value={value}>{children}</CameraContext.Provider>;
}

export function useCamera(): CameraContextValue {
  const ctx = useContext(CameraContext);
  if (!ctx) throw new Error('useCamera must be used inside <CameraProvider>');
  return ctx;
}
