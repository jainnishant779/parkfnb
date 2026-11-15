/**
 * Vehicle service for the consumer app.
 * Wraps GET/POST/PUT/DELETE /api/vehicles endpoints.
 */

import * as api from './api';

export const getUserVehicles = (userId) =>
  api.get(`/api/vehicles/users/${userId}/vehicles`);

export const addVehicle = (userId, data) =>
  api.post(`/api/vehicles/users/${userId}/vehicles`, data);

export const updateVehicle = (vehicleId, data) =>
  api.put(`/api/vehicles/${vehicleId}`, data);

export const deleteVehicle = (vehicleId) =>
  api.delete(`/api/vehicles/${vehicleId}`);

export const setDefaultVehicle = (vehicleId) =>
  api.put(`/api/vehicles/${vehicleId}/set-default`, {});
