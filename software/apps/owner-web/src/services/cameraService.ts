import { api } from '../lib/api';

/** A camera as the backend lists it (who owns it); what it is showing right now comes from the ANPR service (lib/anpr.ts). */
export interface LinkedCamera {
  id: string;
  cameraId: string;
  name?: string;
  status: 'unassigned' | 'active' | 'disabled';
  linkedVia?: 'admin' | 'pairing' | null;
  linkedAt?: string | null;
  propertyId?: { id: string; propertyName?: string; city?: string } | string | null;
}

export const cameraService = {
  mine: () => api.get<LinkedCamera[]>('/api/cameras/mine'),

  /** The one-time code an admin made, the camera ID, and the property this camera is on. */
  pair: (input: { cameraId: string; pairingCode: string; propertyId: string }) =>
    api.post<LinkedCamera>('/api/cameras/pair', input),

  unpair: (cameraId: string) => api.delete<LinkedCamera>(`/api/cameras/${encodeURIComponent(cameraId)}/unpair`),
};
