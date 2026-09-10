import { API_BASE_URL } from './constants';

/**
 * Resolve a stored image reference to a full URL that React Native Image can load.
 *
 * Rules:
 * - http://... / https://... -> as-is
 * - file://... / content://... / data:... -> as-is
 * - /uploads/... -> prepend API_BASE_URL
 * - uploads/... -> prepend API_BASE_URL/
 * - /... -> prepend API_BASE_URL
 * - other strings -> as-is
 */
export function resolveImageUri(uri) {
  if (!uri || typeof uri !== 'string') return '';
  const trimmed = uri.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('content://') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }
  if (trimmed.startsWith('/uploads/')) {
    return `${API_BASE_URL}${trimmed}`;
  }
  if (trimmed.startsWith('uploads/')) {
    return `${API_BASE_URL}/${trimmed}`;
  }
  if (trimmed.startsWith('/')) {
    return `${API_BASE_URL}${trimmed}`;
  }
  return trimmed;
}

/**
 * Check if a URI is a valid resolvable image string
 */
export function isValidImageUri(uri) {
  return typeof uri === 'string' && uri.trim().length > 0;
}
