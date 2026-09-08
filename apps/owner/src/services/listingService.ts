import { api } from './api';
import type {
  ApiProperty,
  ApiSpace,
  ApiAvailabilitySlot,
  PaginationMeta,
} from '../types/api';

/**
 * Normalize backend response objects: Mongoose sends `_id` (not `id`).
 * Our case-transform interceptor preserves `_id` with the leading underscore
 * intact. We coerce to `id` at the service boundary.
 */
const normalizeId = <T extends { _id?: string; id?: string }>(obj: T): T & { id: string } => {
  if (!obj) return obj as any;
  const id = obj.id ?? obj._id ?? '';
  return { ...obj, id } as any;
};

const normalizeProperty = (p: any): ApiProperty => {
  const out = normalizeId(p) as ApiProperty;
  // ownerId may come populated as an object — normalize nested id too
  if (out.ownerId && typeof out.ownerId === 'object') {
    out.ownerId = normalizeId(out.ownerId as any) as any;
  }
  return out;
};

const normalizeSpace = (s: any): ApiSpace => {
  const out = normalizeId(s) as ApiSpace;
  if (out.propertyId && typeof out.propertyId === 'object') {
    out.propertyId = normalizeProperty(out.propertyId as any);
  }
  if (out.ownerId && typeof out.ownerId === 'object') {
    out.ownerId = normalizeId(out.ownerId as any) as any;
  }
  return out;
};

const normalizeSlot = (s: any): ApiAvailabilitySlot => normalizeId(s) as ApiAvailabilitySlot;

export const listingService = {
  // ---- Properties ----

  async listMyProperties(
    ownerId: string,
    page = 1,
    limit = 50,
  ): Promise<{ properties: ApiProperty[]; meta?: PaginationMeta }> {
    const qs = `?page=${page}&limit=${limit}&is_active=true`;
    const result = await api.get<{ properties: any[]; meta?: PaginationMeta }>(
      `/api/properties/owners/${ownerId}${qs}`,
    );
    return {
      properties: (result.properties || []).map(normalizeProperty),
      meta: result.meta,
    };
  },

  async getProperty(id: string): Promise<ApiProperty> {
    const { property } = await api.get<{ property: any }>(`/api/properties/${id}`);
    return normalizeProperty(property);
  },

  async createProperty(data: Partial<ApiProperty>): Promise<ApiProperty> {
    const { property } = await api.post<{ property: any }>('/api/properties', data);
    return normalizeProperty(property);
  },

  async updateProperty(id: string, data: Partial<ApiProperty>): Promise<ApiProperty> {
    const { property } = await api.put<{ property: any }>(`/api/properties/${id}`, data);
    return normalizeProperty(property);
  },

  async deleteProperty(id: string): Promise<void> {
    await api.delete<{ message: string }>(`/api/properties/${id}`);
  },

  async addPropertyImages(id: string, images: string[]): Promise<string[]> {
    const { propertyImages } = await api.post<{ propertyImages: string[] }>(
      `/api/properties/${id}/images`,
      { images },
    );
    return propertyImages;
  },

  // ---- Spaces ----

  async listSpacesByProperty(
    propertyId: string,
  ): Promise<{ property: ApiProperty; spaces: ApiSpace[] }> {
    const result = await api.get<{ property: any; spaces: any[] }>(
      `/api/parking-spaces/properties/${propertyId}`,
    );
    return {
      property: normalizeProperty(result.property),
      spaces: (result.spaces || []).map(normalizeSpace),
    };
  },

  async getSpace(id: string): Promise<ApiSpace> {
    const { space } = await api.get<{ space: any }>(`/api/parking-spaces/${id}`);
    return normalizeSpace(space);
  },

  async createSpace(propertyId: string, data: Partial<ApiSpace>): Promise<ApiSpace> {
    const { space } = await api.post<{ space: any }>(
      `/api/parking-spaces/properties/${propertyId}/spaces`,
      data,
    );
    return normalizeSpace(space);
  },

  async updateSpace(id: string, data: Partial<ApiSpace>): Promise<ApiSpace> {
    const { space } = await api.put<{ space: any }>(`/api/parking-spaces/${id}`, data);
    return normalizeSpace(space);
  },

  async updatePricing(
    id: string,
    data: { pricePerHour?: number; pricePerDay?: number; pricePerMonth?: number },
  ): Promise<ApiSpace> {
    const { space } = await api.put<{ space: any }>(`/api/parking-spaces/${id}/pricing`, data);
    return normalizeSpace(space);
  },

  async deleteSpace(id: string): Promise<void> {
    await api.delete<{ message: string }>(`/api/parking-spaces/${id}`);
  },

  // ---- Availability ----

  async listAvailability(spaceId: string): Promise<ApiAvailabilitySlot[]> {
    const { schedules } = await api.get<{ schedules: any[]; total: number }>(
      `/api/availability/space/${spaceId}`,
    );
    return (schedules || []).map(normalizeSlot);
  },

  async bulkCreateAvailability(
    spaceId: string,
    schedules: Array<Partial<ApiAvailabilitySlot>>,
  ): Promise<{ created: ApiAvailabilitySlot[]; createdCount: number; failedCount: number; errors: any[] }> {
    const result = await api.post<{
      created: any[];
      createdCount: number;
      failedCount: number;
      errors: any[];
    }>(`/api/availability/space/${spaceId}/bulk`, { schedules });
    return {
      created: (result.created || []).map(normalizeSlot),
      createdCount: result.createdCount ?? 0,
      failedCount: result.failedCount ?? 0,
      errors: result.errors ?? [],
    };
  },

  async deleteAvailability(id: string): Promise<void> {
    await api.delete<{ message: string }>(`/api/availability/${id}`);
  },
};
