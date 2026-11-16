import { INDIAN_STATES } from './constants';

export interface PincodeResult {
  /** a code from INDIAN_STATES */
  state: string;
  city: string;
}

interface PostOffice {
  Name: string;
  District: string;
  State: string;
}

/**
 * City and state of a 6-digit pincode, from the India Post lookup the owner app uses. Best effort: any failure (offline, unknown pincode,
 * a state that is not in our list) returns null and the person types the two fields themselves; nothing ever blocks on it.
 */
export async function lookupPincode(pin: string, signal?: AbortSignal): Promise<PincodeResult | null> {
  if (!/^\d{6}$/.test(pin)) return null;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { Status: string; PostOffice: PostOffice[] | null }[];
    const entry = Array.isArray(json) ? json[0] : null;
    if (!entry || entry.Status !== 'Success') return null;
    const office = entry.PostOffice?.[0];
    if (!office) return null;
    const state = INDIAN_STATES.find((s) => s.label.toLowerCase() === office.State.trim().toLowerCase());
    return state ? { state: state.value, city: office.District } : null;
  } catch {
    return null;
  }
}

export interface Coords {
  lat: number;
  lng: number;
}

/** Where this browser is, if the person allows it. Rejects with a readable message. */
export function currentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser cannot share your location. Enter the coordinates by hand.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? 'Location access was blocked. Enter the coordinates by hand.'
              : 'Could not find your location. Enter the coordinates by hand.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  });
}

/** A coordinate typed as text, or null when it is empty or out of range. */
export function parseCoord(text: string, kind: 'lat' | 'lng'): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  const max = kind === 'lat' ? 90 : 180;
  return Math.abs(n) <= max ? n : null;
}

/** A Google Maps link for a spot, to check a pin by eye. */
export const mapsLink = (lat: number, lng: number): string => `https://www.google.com/maps?q=${lat},${lng}`;
