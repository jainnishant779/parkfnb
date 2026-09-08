import { indianStates } from '../constants/mockData';

export interface PincodeLookupResult {
  state: string;    // Two-letter code matching indianStates[].value
  city: string;     // Best-guess city name (PostOffice[0].District)
  country: string;  // ISO code; the postal API is India-only so this is always 'IN'
}

interface PostOffice {
  Name: string;
  District: string;
  State: string;
}

interface PostalApiResponse {
  Status: 'Success' | 'Error' | '404';
  Message: string;
  PostOffice: PostOffice[] | null;
}

const API_URL = 'https://api.postalpincode.in/pincode';

// Map an India Post state name (free text) to the dropdown's two-letter code.
// Case-insensitive label match against `indianStates`. Returns '' if no match.
function stateNameToCode(name: string): string {
  const normalized = name.trim().toLowerCase();
  const match = indianStates.find((s) => s.label.toLowerCase() === normalized);
  return match ? match.value : '';
}

// Best-effort pincode lookup via api.postalpincode.in. Returns null on any
// failure (network error, 404, malformed response, unknown state) — callers
// should treat null as "user types manually" and never block on it.
export async function lookupPincode(pin: string): Promise<PincodeLookupResult | null> {
  if (!/^\d{6}$/.test(pin)) return null;

  try {
    const res = await fetch(`${API_URL}/${pin}`);
    if (!res.ok) return null;

    const json = (await res.json()) as PostalApiResponse[];
    const entry = Array.isArray(json) ? json[0] : null;
    if (!entry || entry.Status !== 'Success') return null;

    const office = entry.PostOffice?.[0];
    if (!office) return null;

    const state = stateNameToCode(office.State);
    if (!state) return null;

    return {
      state,
      city: office.District, // District field from the postal API is the user's city
      country: 'IN',
    };
  } catch {
    return null;
  }
}
