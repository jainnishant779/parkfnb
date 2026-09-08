/**
 * HTTP client with interceptors for case transform, auth token injection,
 * and automatic token refresh on expiry.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { API_BASE_URL, API_TIMEOUT } from '../config/api';
import { toSnakeCase, toCamelCase } from '../utils/caseTransform';
import type { ApiError, ApiErrorResponse } from '../types/api';

const TOKEN_KEY = 'auth:token';

/** Store token securely (swap with react-native-keychain later) */
export const setToken = async (token: string) => {
  await AsyncStorage.setItem(TOKEN_KEY, token);
};

export const getToken = async (): Promise<string | null> => {
  return AsyncStorage.getItem(TOKEN_KEY);
};

export const clearToken = async () => {
  await AsyncStorage.removeItem(TOKEN_KEY);
};

/** Typed API error class */
export class ApiRequestError extends Error {
  code: string;
  http: number;
  details: any;
  traceId: string;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = 'ApiRequestError';
    this.code = apiError.code;
    this.http = apiError.http;
    this.details = apiError.details;
    this.traceId = apiError.traceId;
  }
}

/** Core fetch wrapper with interceptors */
async function request<T>(
  method: string,
  path: string,
  body?: any,
  options?: { skipCaseTransform?: boolean; isFormData?: boolean; retry?: boolean }
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const token = await getToken();

  const headers: Record<string, string> = {};

  if (!options?.isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let fetchBody: any;
  if (options?.isFormData) {
    fetchBody = body; // FormData passed through directly
  } else if (body) {
    fetchBody = JSON.stringify(toSnakeCase(body));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: fetchBody,
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    // Log the raw fetch error so devs can diagnose without DevTools.
    // RN's fetch maps low-level failures to an `Error` whose `message`
    // carries the actual reason (e.g. "Network request failed",
    // "Could not connect to the server", "TLS error"). The user-facing
    // message stays generic to avoid leaking internals.
    // eslint-disable-next-line no-console
    console.error('[api] fetch failed:', {
      method,
      url,
      isFormData: !!options?.isFormData,
      errName: err?.name,
      errMessage: err?.message,
      errCause: err?.cause,
    });
    if (err?.name === 'AbortError') {
      throw new ApiRequestError({
        code: 'NETWORK_TIMEOUT',
        http: 0,
        message: 'Request timed out. Please check your connection.',
        traceId: '',
      });
    }
    throw new ApiRequestError({
      code: 'NETWORK_ERROR',
      http: 0,
      message: __DEV__
        ? `Unable to connect. [${err?.message || err?.name || 'unknown'}]`
        : 'Unable to connect. Please check your internet connection.',
      traceId: '',
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const json = await response.json();

  if (!response.ok) {
    const errorResponse = json as ApiErrorResponse;
    const apiError = errorResponse.error;

    // Handle token expiry — try to refresh once
    if (apiError.code === 'AUTH_TOKEN_EXPIRED' && !options?.retry) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return request<T>(method, path, body, { ...options, retry: true });
      }
      // Refresh failed — clear token, let AuthContext handle sign-out
      await clearToken();
    }

    throw new ApiRequestError(
      toCamelCase(apiError) as ApiError
    );
  }

  // Transform response keys to camelCase
  const data = json.data !== undefined ? toCamelCase(json.data) : toCamelCase(json);
  return data as T;
}

/** Attempt a silent token refresh */
async function tryRefreshToken(): Promise<boolean> {
  try {
    const token = await getToken();
    if (!token) return false;

    const response = await fetch(`${API_BASE_URL}/api/auth/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) return false;

    const json = await response.json();
    if (json.success && json.data?.token) {
      await setToken(json.data.token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Internal RN FormData shape — exposes the entries we need to build a native body. */
type RnFormDataPart =
  | [string, string]
  | [string, { uri: string; name?: string; type?: string }];

/**
 * Multipart upload via `react-native-blob-util`.
 *
 * Why not RN's built-in `fetch` / `XMLHttpRequest`?
 * Both delegate to the same Android networking module, which fails with
 * `Stream Closed` (and on the JS side, `TypeError: Network request failed`)
 * when streaming file URIs from the app's cache directory into a multipart
 * body. The native layer in `react-native-blob-util` builds the body and
 * sends it with its own implementation that handles file URIs reliably.
 *
 * JSON requests still go through the regular `fetch`-based `request<T>`
 * above — they aren't affected by this bug.
 *
 * Signature is unchanged: callers still pass a standard `FormData`, we
 * extract the parts and translate them into RNBU's payload shape.
 * The returned `ApiRequestError` shape matches `request<T>` exactly.
 */
async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const token = await getToken();

  // RN's FormData stores entries on the private `_parts` array; this is
  // the standard escape hatch documented across the RN ecosystem when
  // bridging FormData to a non-fetch HTTP client.
  const parts = ((formData as any)._parts as RnFormDataPart[]) || [];

  const rnbuPayload = parts.map(([name, value]) => {
    if (typeof value === 'string') {
      return { name, data: value };
    }
    // File entry — strip `file://` so RNBU reads it as a filesystem path
    // (the form `wrap()` expects on both platforms).
    const rawUri = value.uri || '';
    const filePath =
      Platform.OS === 'android'
        ? rawUri.replace(/^file:\/\//, '')
        : rawUri.replace(/^file:\/\//, '');
    return {
      name,
      filename: value.name,
      type: value.type,
      data: ReactNativeBlobUtil.wrap(filePath),
    };
  });

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    // RNBU.fetch returns a FetchBlobResponse with .info() and .text() / .json().
    response = await ReactNativeBlobUtil.fetch('POST', url, headers, rnbuPayload);
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[api.upload] RNBU error', {
      url,
      errName: err?.name,
      errMessage: err?.message,
    });
    throw new ApiRequestError({
      code: 'NETWORK_ERROR',
      http: 0,
      message: __DEV__
        ? `Unable to connect. [RNBU: ${err?.message || err?.name || 'unknown'}]`
        : 'Unable to connect. Please check your internet connection.',
      traceId: '',
    });
  }

  const status = response.info().status;
  // RNBU's `.text()` is typed `string | Promise<any>` because it can be
  // async when the body was streamed to disk; for in-memory responses
  // (default for our small JSON replies) it returns synchronously. Await
  // unconditionally — `await` on a non-Promise is a no-op.
  const textRaw = await Promise.resolve(response.text());
  const text = typeof textRaw === 'string' ? textRaw : '';

  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiRequestError({
      code: 'BAD_RESPONSE',
      http: status,
      message: 'Server returned an unreadable response.',
      traceId: '',
    });
  }

  if (status >= 200 && status < 300) {
    const data = json.data !== undefined ? toCamelCase(json.data) : toCamelCase(json);
    return data as T;
  }

  const apiError = json.error
    ? (toCamelCase(json.error) as ApiError)
    : ({
        code: 'SERVER_ERROR',
        http: status,
        message: 'Upload failed.',
        traceId: '',
      } as ApiError);
  throw new ApiRequestError(apiError);
}

/** Public API methods */
export const api = {
  get: <T>(path: string) => request<T>('GET', path),

  post: <T>(path: string, body?: any) => request<T>('POST', path, body),

  put: <T>(path: string, body?: any) => request<T>('PUT', path, body),

  delete: <T>(path: string) => request<T>('DELETE', path),

  /** Upload a file via multipart/form-data using XHR (more reliable than fetch on Android). */
  upload: <T>(path: string, formData: FormData) => uploadRequest<T>(path, formData),
};
