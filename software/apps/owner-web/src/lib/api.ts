/**
 * Thin fetch wrapper around the ParkFNB backend (the same one the admin panel and the mobile apps use).
 *
 *   - prefixes the base URL and attaches the bearer token
 *   - converts camelCase request bodies to the snake_case the backend stores, and responses back
 *   - unwraps the `{ success, data }` envelope, or throws a typed ApiError
 *   - waits out Render's cold start instead of calling it an outage
 *   - swaps a recently expired token for a new one once, then retries
 *   - tells the page when the server cannot be reached (two misses in a row), like the operator console's red bar
 */

import { toCamelCase, toSnakeCase } from './caseTransform';
import { announceSignedOut, clearSession, getToken, setToken } from './auth';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://parkfnb.onrender.com';

/** Render's free tier takes up to a minute to wake: a normal 10 s timeout would turn every cold start into an "outage". */
const REQUEST_TIMEOUT_MS = 60_000;

export interface ApiMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export class ApiError extends Error {
  /** The backend's code (AUTH_FORBIDDEN, ...), or NETWORK / TIMEOUT / BAD_RESPONSE when the request never produced an answer. */
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** A plain camelCase object; converted to snake_case and sent as JSON. */
  body?: unknown;
  /** Query parameters; undefined and null are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Send without the Authorization header (the sign-in endpoints). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

export interface Paged<T> {
  data: T;
  meta: ApiMeta | null;
}

// ----------------------------------------------------------------------------- is the server there?

type NetListener = (reachable: boolean, lastOkAt: number) => void;
const netListeners = new Set<NetListener>();
let netMisses = 0;
let netLastOk = Date.now();

/** Called with false after two failures in a row, and true again once something answers. Returns the unsubscribe function. */
export function onNetwork(listener: NetListener): () => void {
  netListeners.add(listener);
  return () => netListeners.delete(listener);
}

export function reportReachability(ok: boolean): void {
  if (ok) {
    const was = netMisses >= 2;
    netMisses = 0;
    netLastOk = Date.now();
    if (was) netListeners.forEach((l) => l(true, netLastOk));
    return;
  }
  netMisses += 1;
  if (netMisses >= 2) netListeners.forEach((l) => l(false, netLastOk));
}

// ----------------------------------------------------------------------------- the request

const buildUrl = (path: string, query?: RequestOptions['query']): string => {
  const url = new URL(path.replace(/^\//, ''), `${API_BASE_URL.replace(/\/$/, '')}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time, however many requests found the token expired together. */
function tryRefreshToken(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const token = getToken();
    if (!token) return false;
    try {
      const res = await fetch(buildUrl('/api/auth/refresh-token'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      const fresh = (await res.json())?.data?.token;
      if (typeof fresh !== 'string' || !fresh) return false;
      setToken(fresh);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function send(
  path: string,
  init: { method: string; body?: BodyInit; json: boolean },
  options: RequestOptions,
  retried: boolean,
): Promise<{ data: unknown; meta: ApiMeta | null }> {
  const { query, anonymous = false, signal } = options;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.json && init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!anonymous) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method: init.method,
      headers,
      body: init.body,
      signal: controller.signal,
    });
  } catch {
    // An aborted fetch looks like a network failure by type alone: the controller says which it was.
    const timedOut = controller.signal.aborted && !signal?.aborted;
    if (!signal?.aborted) reportReachability(false);
    if (signal?.aborted) throw new ApiError('ABORTED', 0, 'Cancelled');
    throw new ApiError(
      timedOut ? 'TIMEOUT' : 'NETWORK',
      0,
      timedOut ? 'The server took too long to respond. Please try again.' : 'Could not reach the server. Check your connection.',
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
  reportReachability(response.status !== 502 && response.status !== 503 && response.status !== 504);

  // A proxy error or a crashed process can answer HTML, so never assume JSON.
  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError('BAD_RESPONSE', response.status, 'The server returned an unreadable response.');
    }
  }

  const envelope = payload as {
    success?: boolean;
    data?: unknown;
    meta?: unknown;
    error?: { code?: string; http?: number; message?: string };
  } | null;

  if (!response.ok || envelope?.success === false) {
    const err = envelope?.error;
    if (!anonymous && !retried && err?.code === 'AUTH_TOKEN_EXPIRED' && (await tryRefreshToken())) {
      return send(path, init, options, true);
    }
    // A rejected token would otherwise leave the page signed in on the outside and failing on every request.
    if (!anonymous && response.status === 401) {
      clearSession();
      announceSignedOut();
    }
    throw new ApiError(
      err?.code ?? 'UNKNOWN',
      err?.http ?? response.status,
      err?.message ?? 'Something went wrong. Please try again.',
    );
  }

  // /health answers with a bare object rather than the envelope.
  const data = envelope && 'data' in envelope ? envelope.data : payload;
  return {
    data: toCamelCase(data),
    meta: envelope?.meta ? toCamelCase<ApiMeta>(envelope.meta) : null,
  };
}

async function rawRequest(path: string, options: RequestOptions = {}) {
  const { method = 'GET', body } = options;
  return send(
    path,
    { method, body: body === undefined ? undefined : JSON.stringify(toSnakeCase(body)), json: true },
    options,
    false,
  );
}

/** A request, returning the unwrapped camelCased `data`. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await rawRequest(path, options);
  return data as T;
}

/** The same, also returning the pagination `meta`. */
export async function requestPaged<T>(path: string, options: RequestOptions = {}): Promise<Paged<T>> {
  const { data, meta } = await rawRequest(path, options);
  return { data: data as T, meta };
}

export interface UploadResult {
  url: string;
  publicId?: string;
  format?: string;
  bytes?: number;
  filename?: string;
  mimeType?: string;
}

/** POST /api/uploads (multipart, field `file`): a listing photo, a KYC document, a profile picture. Returns the URL to store on the record. */
export async function upload(file: File, options: { signal?: AbortSignal } = {}): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await send('/api/uploads', { method: 'POST', body: form, json: false }, options, false);
  return data as UploadResult;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'DELETE' }),
  getPaged: requestPaged,
  upload,
};
