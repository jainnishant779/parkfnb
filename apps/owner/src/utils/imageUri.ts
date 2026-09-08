import { API_BASE_URL } from '../config/api';

/**
 * Resolve a stored image reference to something the RN Image component can load.
 *
 * Rules:
 * - `http://...` / `https://...` → as-is
 * - `/uploads/X.jpg` (relative backend path) → prefix with API_BASE_URL
 * - `sample://...` → returned as-is; callers should show a placeholder UI, NOT pass to Image
 * - `file://...` / `content://...` (local device URIs) → as-is
 * - anything else → as-is
 */
export function resolveImageUri(uri: string | undefined | null): string {
  if (!uri) return '';
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  if (uri.startsWith('/uploads/')) return `${API_BASE_URL}${uri}`;
  return uri;
}

/** Is this a sample/mock URI that should render as a placeholder? */
export function isSampleUri(uri: string): boolean {
  return uri.startsWith('sample://');
}

/** Is this a placeholder URL that the backend stores for mock uploads? */
export function isPlaceholderUrl(uri: string): boolean {
  return uri.includes('placeholder-');
}

/**
 * Turn whatever the picker gave us into something the backend can store.
 *
 * A local `file://` / `content://` URI is uploaded and replaced with the
 * returned `/uploads/...` path; anything already stored stays as it is.
 * Sample URIs keep their placeholder behaviour so seeded demo data still
 * round-trips.
 *
 * Uploads run in parallel — a listing carries several photos and doing them
 * one after another is needlessly slow on a phone connection.
 */
export async function uploadLocalImages(uris: string[]): Promise<string[]> {
  const { ownerService } = await import('../services/ownerService');

  return Promise.all(
    uris.map(async (uri) => {
      if (!uri) return uri;
      if (uri.startsWith('/uploads/') || uri.startsWith('http')) return uri;
      if (isSampleUri(uri)) return `/uploads/placeholder-${Date.now()}.jpg`;
      if (!uri.startsWith('file://') && !uri.startsWith('content://')) return uri;

      const mimeType = uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const result = await ownerService.uploadFile(uri, mimeType);
      return result.url;
    }),
  );
}
