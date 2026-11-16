/**
 * Talking to the ANPR service (ai/anpr) directly from the browser.
 *
 * The backend (Render) only decides WHICH cameras this owner may see: POST /api/cameras/access-grant returns a short-lived signed pass
 * for each ANPR server. The pictures, plates and reports then come straight from the ANPR server with that pass in an Authorization
 * header (never in a URL: a token in a URL ends up in logs, history and screenshots, and these are number plates). Nothing here goes
 * through the backend, so a sleeping free-tier backend never holds up a live picture.
 *
 * ANPR answers are snake_case JSON and are used as they come (see lot.ts).
 *
 * A pass lives 15 minutes and is renewed after two thirds of that; until the renewal arrives the old one keeps working, so a slow
 * backend wake-up never cuts the picture. Unlinking a camera therefore takes effect within 15 minutes.
 */
import { api, ApiError, reportReachability } from './api';

export interface GrantCamera {
  cameraId: string;
  name: string;
  propertyId: string | null;
  propertyName: string | null;
}

interface GrantResponse {
  expiresAt: string;
  refreshAfterS: number;
  grants: { anprBaseUrl: string; token: string; cameras: GrantCamera[] }[];
}

interface Entry {
  base: string;
  token: string;
}

let entries = new Map<string, Entry>(); // camera id -> where it lives and the pass to use
let cameras: GrantCamera[] = [];
let timer: number | undefined;
let inflight: Promise<void> | null = null;
let grantError: string | null = null;
let started = false;
/** true once the backend has answered at least once: from then on a camera that is not in the grant is simply not the owner's */
let loadedOnce = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

/** Called whenever the list of cameras or the grant state changes. Returns the unsubscribe function. */
export function onGrants(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const grantedCameras = (): GrantCamera[] => cameras;
/** Why the grant could not be had (for example "Camera access is not set up yet"), or null. */
export const getGrantError = (): string | null => grantError;

function schedule(ms: number): void {
  window.clearTimeout(timer);
  if (started) timer = window.setTimeout(() => void refreshGrants(true), Math.max(30_000, ms));
}

/** Never ask the backend for a pass more often than this, except on the schedule or when told to (a refused picture asks too). */
const MIN_GAP_MS = 10_000;
let lastAttemptAt = 0;

/** What listeners care about: which cameras, how they are named, and why there are none. A renewed pass is not a change. */
const signature = (): string => JSON.stringify([cameras.map((c) => [c.cameraId, c.name, c.propertyName]), grantError]);

/**
 * Ask the backend for fresh passes. One at a time; a failure keeps the old passes and tries again in a minute.
 *
 * `force` is for the schedule and for a person's own action (pairing, unpairing). Everything else, such as a picture refused because its
 * pass ran out, waits out MIN_GAP_MS: with many pages polling, an expired pass or a backend that is down would otherwise be asked about
 * hundreds of times a minute (it was: 173 attempts in 76 seconds).
 */
export function refreshGrants(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && Date.now() - lastAttemptAt < MIN_GAP_MS) return Promise.resolve();
  lastAttemptAt = Date.now();
  inflight = (async () => {
    // Listeners are told only when the list of cameras or the error CHANGED. Passes are replaced on every renewal, but anyone who needs
    // one reads it at the moment of the request, so announcing a renewal would only restart every poll that listens (a refused
    // request refreshes, the refresh announces, the announcement restarts the poll that was refused: a loop of hundreds of requests).
    const before = signature();
    try {
      const res = await api.post<GrantResponse>('/api/cameras/access-grant');
      const next = new Map<string, Entry>();
      const list: GrantCamera[] = [];
      for (const g of res.grants || []) {
        for (const c of g.cameras || []) {
          next.set(c.cameraId, { base: g.anprBaseUrl.replace(/\/+$/, ''), token: g.token });
          list.push(c);
        }
      }
      entries = next;
      cameras = list;
      grantError = null;
      loadedOnce = true;
      schedule((res.refreshAfterS || 600) * 1000);
    } catch (e) {
      grantError = e instanceof ApiError ? e.message : 'Could not get camera access';
      schedule(60_000);
    } finally {
      inflight = null;
      if (signature() !== before) notify();
    }
  })();
  return inflight;
}

/** Begin keeping passes fresh (after sign-in). */
export function startGrants(): void {
  if (started) return;
  started = true;
  void refreshGrants(true);
}

/** Forget everything (sign-out): no pass outlives the person who held it. */
export function stopGrants(): void {
  started = false;
  loadedOnce = false;
  lastAttemptAt = 0;
  window.clearTimeout(timer);
  entries = new Map();
  cameras = [];
  grantError = null;
  notify();
}

// ----------------------------------------------------------------------------- requests

export interface AnprOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

function urlFor(base: string, path: string, query?: AnprOptions['query']): string {
  const url = new URL(`${base}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function entryFor(cameraId: string): Promise<Entry> {
  let entry = entries.get(cameraId);
  // Ask the backend again only if it has never answered; after that a camera that is not in the grant is not this owner's (a stale
  // saved selection, an unlinked camera), and asking again changes nothing. `refresh()` in CameraContext is for "something was just linked".
  if (!entry && !loadedOnce) {
    await refreshGrants();
    entry = entries.get(cameraId);
  }
  if (!entry) throw new ApiError('NO_CAMERA', 404, grantError || 'That camera is not linked to you.');
  return entry;
}

async function call(base: string, token: string, path: string, opts: AnprOptions): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(urlFor(base, path, opts.query), {
      method: opts.method || 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
      cache: 'no-store',
    });
  } catch {
    if (opts.signal?.aborted) throw new ApiError('ABORTED', 0, 'Cancelled');
    reportReachability(false);
    throw new ApiError('NETWORK', 0, 'Could not reach the camera server. Check your connection.');
  }
  reportReachability(res.status !== 502 && res.status !== 503 && res.status !== 504);
  return res;
}

/** A request to one of the owner's cameras: `path` is what follows /owner/api/cameras/{id}. Renews the pass once if it was refused. */
export async function anprFetch(cameraId: string, path: string, opts: AnprOptions = {}): Promise<Response> {
  const full = `/owner/api/cameras/${encodeURIComponent(cameraId)}${path}`;
  let entry = await entryFor(cameraId);
  let res = await call(entry.base, entry.token, full, opts);
  if (res.status === 401) {
    await refreshGrants();
    entry = await entryFor(cameraId);
    res = await call(entry.base, entry.token, full, opts);
  }
  return res;
}

async function failure(res: Response): Promise<ApiError> {
  let message = `The camera server answered ${res.status}.`;
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string') message = body.error;
  } catch {
    // not JSON
  }
  return new ApiError(`ANPR_${res.status}`, res.status, message);
}

/** JSON from one camera (snake_case, not converted). Throws ApiError with the server's own words. A 204 returns null. */
export async function anprJson<T>(cameraId: string, path: string, opts: AnprOptions = {}): Promise<T | null> {
  const res = await anprFetch(cameraId, path, opts);
  if (res.status === 204) return null;
  if (!res.ok) throw await failure(res);
  return (await res.json()) as T;
}

export interface AnprBlob {
  /** null when there is nothing new (204) or the picture was held back (429) */
  blob: Blob | null;
  status: number;
  /** the frame number of the picture, when the server sent one */
  seq: number | null;
}

/** A picture or file. 204 (nothing new) and 429 (too soon) are answers, not errors: the page just keeps what it has. */
export async function anprBlob(cameraId: string, path: string, opts: AnprOptions = {}): Promise<AnprBlob> {
  const res = await anprFetch(cameraId, path, opts);
  const seqHeader = res.headers.get('X-Frame-Seq');
  const seq = seqHeader === null ? null : Number(seqHeader);
  if (res.status === 204 || res.status === 429) return { blob: null, status: res.status, seq: Number.isFinite(seq) ? seq : null };
  if (!res.ok) throw await failure(res);
  return { blob: await res.blob(), status: res.status, seq: Number.isFinite(seq) ? seq : null };
}

/** A picture as a URL for an <img>. The caller revokes it (URL.revokeObjectURL) when it is replaced or the page goes. null: not there. */
export async function anprImageUrl(cameraId: string, path: string, opts: AnprOptions = {}): Promise<string | null> {
  try {
    const { blob } = await anprBlob(cameraId, path, opts);
    return blob ? URL.createObjectURL(blob) : null;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.code === 'ABORTED')) return null;
    throw e;
  }
}

/** Save a CSV (or any file) from one camera to the person's computer. */
export async function anprDownload(cameraId: string, path: string, filename: string, opts: AnprOptions = {}): Promise<void> {
  const { blob } = await anprBlob(cameraId, path, opts);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The camera list of every ANPR server this owner has a pass for (live status of each camera). */
export async function anprCameras<T>(signal?: AbortSignal): Promise<{ timezone: string | null; cameras: T[] }> {
  const servers = new Map<string, string>();
  for (const e of entries.values()) servers.set(e.base, e.token);
  const out: T[] = [];
  let timezone: string | null = null;
  await Promise.all(
    [...servers].map(async ([base, token]) => {
      const res = await call(base, token, '/owner/api/cameras', { signal });
      if (!res.ok) throw await failure(res);
      const body = (await res.json()) as { timezone?: string; cameras: T[] };
      timezone = timezone || body.timezone || null;
      out.push(...body.cameras);
    }),
  );
  return { timezone, cameras: out };
}
