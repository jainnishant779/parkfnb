import { api } from '../lib/api';
import type { AvailabilitySlot, Property, PropertyInput, ScheduleInput, Space, SpaceInput } from '../types/listings';

/**
 * Properties, parking spaces and their weekly hours: the endpoints the owner app's listing screens use.
 *
 * Deleting is soft on the backend (a property gets `isActive: false`, a space gets `status: 'unavailable'`), and a property's space list still
 * contains the deleted ones, so `liveSpaces` drops them. A space with no availability rows is open 24 hours a day.
 */

/** The spaces an owner still has: not deleted. */
export const liveSpaces = (spaces: Space[]): Space[] => spaces.filter((s) => s.status !== 'unavailable');

export const listingService = {
  // ---- properties

  /** The owner's properties (not the deleted ones), newest first. */
  async listProperties(ownerId: string, signal?: AbortSignal): Promise<Property[]> {
    const { data } = await api.getPaged<{ properties: Property[] }>(`/api/properties/owners/${ownerId}`, {
      query: { page: 1, limit: 100, is_active: true },
      signal,
    });
    return data.properties || [];
  },

  async getProperty(id: string, signal?: AbortSignal): Promise<Property> {
    const res = await api.get<{ property: Property }>(`/api/properties/${id}`, { signal });
    return res.property;
  },

  async createProperty(input: PropertyInput): Promise<Property> {
    const res = await api.post<{ property: Property }>('/api/properties', input);
    return res.property;
  },

  async updateProperty(id: string, input: Partial<PropertyInput>): Promise<Property> {
    const res = await api.put<{ property: Property }>(`/api/properties/${id}`, input);
    return res.property;
  },

  deleteProperty: (id: string) => api.delete<{ message: string }>(`/api/properties/${id}`),

  // ---- spaces

  /** Every space of a property, deleted ones included (see liveSpaces). */
  async listSpaces(propertyId: string, signal?: AbortSignal): Promise<Space[]> {
    const res = await api.get<{ spaces: Space[] }>(`/api/parking-spaces/properties/${propertyId}`, { signal });
    return res.spaces || [];
  },

  async getSpace(id: string, signal?: AbortSignal): Promise<Space> {
    const res = await api.get<{ space: Space }>(`/api/parking-spaces/${id}`, { signal });
    return res.space;
  },

  async createSpace(propertyId: string, input: SpaceInput): Promise<Space> {
    const res = await api.post<{ space: Space }>(`/api/parking-spaces/properties/${propertyId}/spaces`, input);
    return res.space;
  },

  async updateSpace(id: string, input: Partial<SpaceInput>): Promise<Space> {
    const res = await api.put<{ space: Space }>(`/api/parking-spaces/${id}`, input);
    return res.space;
  },

  /** Pause or resume bookings for a space. */
  setSpaceAvailable: (id: string, isAvailable: boolean) => listingService.updateSpace(id, { isAvailable }),

  deleteSpace: (id: string) => api.delete<{ message: string }>(`/api/parking-spaces/${id}`),

  // ---- weekly hours

  async listSchedules(spaceId: string, signal?: AbortSignal): Promise<AvailabilitySlot[]> {
    const res = await api.get<{ schedules: AvailabilitySlot[] }>(`/api/availability/space/${spaceId}`, { signal });
    return res.schedules || [];
  },

  /**
   * Replace a space's weekly hours: remove what is there, then add `schedules`. An empty list leaves the space open 24 hours. The backend
   * refuses overlapping slots, so the old ones have to go first (the owner app does the same). Returns how many new slots failed.
   */
  async replaceSchedules(spaceId: string, schedules: ScheduleInput[]): Promise<{ failed: number }> {
    const existing = await listingService.listSchedules(spaceId);
    await Promise.all(existing.map((s) => api.delete(`/api/availability/${s.id}`)));
    if (!schedules.length) return { failed: 0 };
    const res = await api.post<{ failedCount?: number }>(`/api/availability/space/${spaceId}/bulk`, { schedules });
    return { failed: res.failedCount || 0 };
  },
};
