import { api } from './api';
import type { ProfileResponse, KycResponse, UploadResponse } from '../types/api';
import { Platform } from 'react-native';

export const ownerService = {
  updateProfile: (data: Record<string, any>) =>
    api.put<ProfileResponse>('/api/owners/me/profile', data),

  submitKyc: (data: Record<string, any>) =>
    api.put<KycResponse>('/api/owners/me/kyc', data),

  saveKycDraft: (data: Record<string, any>) =>
    api.put<{ message: string; owner: any }>('/api/owners/me/kyc/draft', data),

  uploadFile: async (uri: string, mimeType: string): Promise<UploadResponse> => {

    const filename = uri.split('/').pop() || `upload-${Date.now()}`;
    const formData = new FormData();
    formData.append('file', {
      uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
      type: mimeType,
      name: filename,
    } as any);

    return api.upload<UploadResponse>('/api/uploads', formData);
  },
};
