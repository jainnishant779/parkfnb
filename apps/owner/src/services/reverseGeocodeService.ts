import { indianStates } from '../constants/mockData';

export interface ReverseGeocodeResult {
  /** 6-digit Indian pincode (postcode) if Nominatim returned one. */
  pincode: string;
  /** Two-letter code matching indianStates[].value (e.g., 'KA' for Karnataka). Empty if unmatched. */
  state: string;
  /** Best-guess city name (city / town / village / city_district / county fallback chain). */
  city: string;
  /** ISO country code in upper case (e.g., 'IN'). */
  country: string;
  /** Best-guess "address line 1" (road + suburb if available) — useful as a starter value. */
  addressLine1: string;
}

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  city_district?: string;
  state_district?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string; // lowercased ISO (e.g. 'in')
}

interface NominatimResponse {
  address?: NominatimAddress;
  error?: string;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

// Nominatim's usage policy requires a User-Agent. RN's fetch will set
// a default UA, but Nominatim sometimes 403s anonymous-looking traffic;
// a stable identifier keeps us within their rate-limit fairness.
const USER_AGENT = 'AIB-Parking/1.0 (owner-app)';

function stateNameToCode(name?: string): string {
  if (!name) return '';
  const normalized = name.trim().toLowerCase();
  const match = indianStates.find((s) => s.label.toLowerCase() === normalized);
  return match ? match.value : '';
}

function pickCity(addr: NominatimAddress): string {
  return (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.city_district ||
    addr.county ||
    ''
  );
}

function pickAddressLine1(addr: NominatimAddress): string {
  const parts = [
    addr.road || addr.pedestrian || '',
    addr.suburb || addr.neighbourhood || '',
  ].filter((s) => s && s.trim());
  return parts.join(', ');
}

// Best-effort reverse geocode via api.openstreetmap (Nominatim). Returns
// null on any failure — callers should treat null as "no prefill, user
// types manually" and never block on it. Does not throw.
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> {
  try {
    const url = `${ENDPOINT}?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=14`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as NominatimResponse;
    const addr = json.address;
    if (!addr) return null;
    return {
      pincode: addr.postcode || '',
      state: stateNameToCode(addr.state),
      city: pickCity(addr),
      country: (addr.country_code || '').toUpperCase() || 'IN',
      addressLine1: pickAddressLine1(addr),
    };
  } catch {
    return null;
  }
}
