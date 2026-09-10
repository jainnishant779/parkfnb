import { api } from './api';

export interface DeviceState {
  state: 'open' | 'secure' | 'moving' | 'fault' | 'idle' | 'unknown';
  angle: number;
  target: number;
  moving: boolean;
  pwm: number;
  rssi: number;
  battery_level: number;
  fw_version: string;
  fault_reason?: string | null;
  updated_at: string;
}

export interface IoTDevice {
  _id: string;
  device_id: string;
  name: string;
  device_type: 'barrier' | 'lock' | 'gate';
  status: 'online' | 'offline' | 'error' | 'maintenance';
  last_state: DeviceState;
  last_seen_at?: string | null;
  parking_space_id?: {
    _id: string;
    space_number: string;
    space_type: string;
  } | null;
  created_at: string;
}

export const iotService = {
  getMyDevices: () => api.get<{ devices: IoTDevice[] }>('/api/devices/my-devices'),

  pairDevice: (data: {
    device_id: string;
    name?: string;
    parking_space_id?: string;
    device_type?: string;
    secret_token?: string;
  }) => api.post<{ device: IoTDevice; message: string }>('/api/devices/pair', data),

  getDeviceTelemetry: (deviceId: string) =>
    api.get<{
      device_id: string;
      name: string;
      status: string;
      last_state: DeviceState;
      last_seen_at: string;
      parking_space: any;
      is_broker_connected: boolean;
    }>(`/api/devices/${deviceId}/telemetry`),

  sendCommand: (
    deviceId: string,
    command: 'open' | 'close' | 'stop' | 'cal' | 'status' | 'clear',
    params?: Record<string, any>
  ) => api.post<{ result: any; message: string }>(`/api/devices/${deviceId}/command`, { command, params }),

  unpairDevice: (deviceId: string) =>
    api.delete<{ message: string }>(`/api/devices/${deviceId}/unpair`),
};
