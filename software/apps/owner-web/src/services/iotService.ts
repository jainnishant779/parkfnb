import { api } from '../lib/api';
import type { AccessLog, Barrier, BarrierTelemetry, OwnerSpace } from '../types/business';

/**
 * The owner's barriers. (The owner app reads snake_case fields off camelCased answers here and so shows empty values: these types and
 * calls use the camelCase the API layer really produces.)
 */
const enc = encodeURIComponent;

export type BarrierCommand = 'open' | 'close' | 'stop';

interface PropertyRow {
  id: string;
  propertyName?: string;
}
interface SpaceRow {
  id: string;
  spaceNumber?: string;
  spaceType?: string;
  deviceId?: string | null;
}

export const iotService = {
  async devices(signal?: AbortSignal): Promise<Barrier[]> {
    return (await api.get<{ devices: Barrier[] }>('/api/devices/my-devices', { signal })).devices || [];
  },

  telemetry: (id: string, signal?: AbortSignal) => api.get<BarrierTelemetry>(`/api/devices/${enc(id)}/telemetry`, { signal }),

  /** `open` and `close` also go to the physical barrier through the backend's MQTT and Firebase bridge. */
  command: (id: string, command: BarrierCommand) =>
    api.post<{ result?: { transport?: string; success?: boolean }; message?: string }>(`/api/devices/${enc(id)}/command`, { command }),

  /** Registers the device if its ID is new, and links it to a space. */
  pair: (input: { deviceId: string; name?: string; parkingSpaceId?: string }) =>
    api.post<{ device: Barrier; message: string }>('/api/devices/pair', input),

  unpair: (id: string) => api.delete<{ message: string }>(`/api/devices/${enc(id)}/unpair`),

  async logs(id: string, signal?: AbortSignal): Promise<AccessLog[]> {
    return (await api.get<{ logs: AccessLog[] }>(`/api/devices/${enc(id)}/logs`, { signal })).logs || [];
  },

  /** Every space of the owner (a barrier is paired to one). There is no "my spaces" endpoint: properties first, then each one's spaces. */
  async spaces(ownerId: string, signal?: AbortSignal): Promise<OwnerSpace[]> {
    const { properties } = await api.get<{ properties: PropertyRow[] }>(`/api/properties/owners/${ownerId}`, { query: { limit: 100 }, signal });
    const lists = await Promise.all(
      (properties || []).map(async (p) => {
        const res = await api.get<{ spaces: SpaceRow[] }>(`/api/parking-spaces/properties/${p.id}`, { signal });
        return (res.spaces || []).map<OwnerSpace>((s) => ({
          id: s.id,
          spaceNumber: s.spaceNumber || '–',
          propertyName: p.propertyName || 'Property',
          spaceType: s.spaceType,
          deviceId: s.deviceId ?? null,
        }));
      }),
    );
    return lists.flat();
  },
};
