import { api } from '../lib/api';
import type { Booking } from '../types/business';

/**
 * The owner's bookings and the decisions an owner makes on them (the same endpoints the owner app uses).
 *
 * The list endpoint filters on one status only and has no search or dates, so the page fetches every page (up to 1000 bookings)
 * once and tabs, search and filters work on that. Every action sends a body (even an empty one): the backend reads `req.body` and
 * Express 5 leaves it undefined when nothing was sent.
 */
const PAGE = 100; // the backend's own cap
const MAX_PAGES = 10;
const enc = encodeURIComponent;

export const bookingService = {
  /** Every booking of an owner, newest first. */
  async listAll(ownerId: string, signal?: AbortSignal): Promise<Booking[]> {
    const out: Booking[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { data, meta } = await api.getPaged<Booking[]>(`/api/bookings/owners/${ownerId}/bookings`, {
        query: { page, limit: PAGE },
        signal,
      });
      out.push(...(data || []));
      if (!meta || page >= meta.totalPages) break;
    }
    return out;
  },

  async get(id: string, signal?: AbortSignal): Promise<Booking> {
    return (await api.get<{ booking: Booking }>(`/api/bookings/${enc(id)}`, { signal })).booking;
  },

  approve: async (id: string) => (await api.put<{ booking: Booking }>(`/api/bookings/${enc(id)}/approve`, {})).booking,

  reject: async (id: string, reason?: string) =>
    (await api.put<{ booking: Booking }>(`/api/bookings/${enc(id)}/reject`, { rejectionReason: reason || undefined })).booking,

  checkIn: async (id: string) => (await api.put<{ booking: Booking }>(`/api/bookings/${enc(id)}/checkin`, {})).booking,

  /** Also answers `overtime` when the renter stayed past the end and a charge was added. */
  checkOut: (id: string) =>
    api.put<{ booking: Booking; overtime?: { charge: number; message: string } | null }>(`/api/bookings/${enc(id)}/checkout`, {}),

  noShow: async (id: string) => (await api.put<{ booking: Booking }>(`/api/bookings/${enc(id)}/noshow`, {})).booking,
};
