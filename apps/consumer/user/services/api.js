/**
 * HTTP client for the consumer app.
 * Mirrors the owner app's api.ts pattern adapted for JavaScript.
 *
 * Features:
 *  - Injects Authorization: Bearer token from AsyncStorage on every request
 *  - Outgoing body: camelCase → snake_case transform
 *  - Incoming response: snake_case → camelCase transform (_id → id)
 *  - On 401 + AUTH_TOKEN_EXPIRED: silent refresh + retry once
 *  - Throws plain object { code, http, message, details } on failure
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, API_TIMEOUT, STORAGE_KEYS } from '../utils/constants';
import { toSnakeCase, toCamelCase } from '../utils/caseTransform';

// ─── Token helpers ───────────────────────────────────────────────────────────

export const setToken = async (token) => {
  await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
};

export const getToken = async () => {
  return AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
};

export const clearToken = async () => {
  await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
};

// ─── Core request ────────────────────────────────────────────────────────────

/**
 * @param {string} method  HTTP method
 * @param {string} path    Path relative to API_BASE_URL (e.g. '/api/auth/otp/send')
 * @param {any}    body    Request body (will be snake_cased + JSON-stringified)
 * @param {{ isFormData?: boolean; retry?: boolean }} opts
 * @returns {Promise<any>} Parsed + camelCased response data
 * @throws {{ code: string, http: number, message: string, details?: any }}
 */
async function request(method, path, body, opts = {}) {
  const url = `${API_BASE_URL}${path}`;
  const token = await getToken();

  const headers = {};
  if (!opts.isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let fetchBody;
  if (opts.isFormData) {
    fetchBody = body;
  } else if (body !== undefined) {
    fetchBody = JSON.stringify(toSnakeCase(body));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: fetchBody,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw { code: 'NETWORK_TIMEOUT', http: 0, message: 'Request timed out. Please check your connection.' };
    }
    throw { code: 'NETWORK_ERROR', http: 0, message: 'Unable to connect. Please check your internet connection.' };
  } finally {
    clearTimeout(timeoutId);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw { code: 'PARSE_ERROR', http: response.status, message: 'Invalid server response.' };
  }

  if (!response.ok) {
    const apiError = json?.error || {};

    // Handle token expiry — try to refresh once
    if (apiError.code === 'AUTH_TOKEN_EXPIRED' && !opts.retry) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return request(method, path, body, { ...opts, retry: true });
      }
      await clearToken();
    }

    throw toCamelCase(apiError);
  }

  // Transform response keys to camelCase
  const data = json.data !== undefined ? toCamelCase(json.data) : toCamelCase(json);
  return data;
}

// ─── Silent token refresh ─────────────────────────────────────────────────────

async function tryRefreshToken() {
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

// ─── Public API ───────────────────────────────────────────────────────────────

export const get = (path) => request('GET', path);
export const post = (path, body) => request('POST', path, body);
export const put = (path, body) => request('PUT', path, body);
export const del = (path) => request('DELETE', path);
export const upload = (path, formData) => request('POST', path, formData, { isFormData: true });
