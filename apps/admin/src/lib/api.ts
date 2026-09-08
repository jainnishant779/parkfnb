/**
 * Thin fetch wrapper around the Parkfnb backend.
 *
 * Responsibilities, all of which every caller would otherwise repeat:
 *   - prefix the base URL and attach the bearer token
 *   - convert camelCase request bodies to the snake_case the backend expects,
 *     and convert responses back
 *   - unwrap the `{ success, data }` envelope, or throw a typed ApiError
 *   - time out rather than hanging forever
 */

import { toCamelCase, toSnakeCase } from './caseTransform';
import { getToken, clearSession } from './auth';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'https://parkfnb.onrender.com';

/**
 * Render's free tier suspends an idle service and takes roughly a minute to
 * boot it again on the first request. A conventional 10-15s timeout would make
 * every cold start look like an outage, so we wait it out.
 */
const REQUEST_TIMEOUT_MS = 60_000;

/** Pagination lives in a top-level `meta`, alongside `data` rather than inside it. */
export interface ApiMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export class ApiError extends Error {
  /** Backend application code, e.g. AUTH_FORBIDDEN. 'NETWORK' / 'TIMEOUT' when the request never landed. */
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
  /** Plain camelCase object; converted to snake_case and JSON-encoded. */
  body?: unknown;
  /** Query params. Undefined and null values are dropped rather than sent as "undefined". */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Send without an Authorization header — used by the sign-in endpoints. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

/** A response plus its pagination metadata, for endpoints that paginate. */
export interface Paged<T> {
  data: T;
  meta: ApiMeta | null;
}

const buildUrl = (path: string, query?: RequestOptions['query']): string => {
  const url = new URL(path.replace(/^\//, ''), `${API_BASE_URL.replace(/\/$/, '')}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

/**
 * Performs the request and returns the parsed envelope. Kept separate from
 * request() so callers that need `meta` can reach it without a second fetch.
 */
async function rawRequest(path: string, options: RequestOptions = {}): Promise<{
  data: unknown;
  meta: ApiMeta | null;
}> {
  const { method = 'GET', body, query, anonymous = false, signal } = options;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // Let a caller-supplied signal (component unmount) also cancel the request.
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!anonymous) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(toSnakeCase(body)),
      signal: controller.signal,
    });
  } catch (err) {
    // An aborted fetch is indistinguishable from a network failure by type
    // alone, so check the controller to give the accurate message.
    if (controller.signal.aborted) {
      throw new ApiError('TIMEOUT', 0, 'The server took too long to respond. Please try again.');
    }
    throw new ApiError('NETWORK', 0, 'Could not reach the server. Check your connection.');
  } finally {
    window.clearTimeout(timeoutId);
  }

  // A proxy error or a crashed process can return HTML, so never assume JSON.
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
    const error = envelope?.error;
    // An expired or revoked token would otherwise leave the panel in a broken
    // half-signed-in state on every subsequent request.
    if (response.status === 401) clearSession();
    throw new ApiError(
      error?.code ?? 'UNKNOWN',
      error?.http ?? response.status,
      error?.message ?? 'Something went wrong. Please try again.',
    );
  }

  // /health answers with a bare object rather than the { success, data }
  // envelope the /api routes use, so fall back to the whole payload.
  const data = envelope && 'data' in envelope ? envelope.data : payload;

  return {
    data: toCamelCase(data),
    meta: envelope?.meta ? toCamelCase<ApiMeta>(envelope.meta) : null,
  };
}

/** Issues a request and returns the unwrapped, camelCased `data`. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await rawRequest(path, options);
  return data as T;
}

/** Same as request(), but also returns the pagination `meta` when present. */
export async function requestPaged<T>(
  path: string,
  options: RequestOptions = {},
): Promise<Paged<T>> {
  const { data, meta } = await rawRequest(path, options);
  return { data: data as T, meta };
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
  getPaged: requestPaged,
};
