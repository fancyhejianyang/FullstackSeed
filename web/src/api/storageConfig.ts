import request from '@/utils/request';

export type StorageProvider = 'local' | 'aliyun-oss' | 'tencent-cos' | 'qiniu';

export interface StorageConfig {
  enabled: boolean;
  provider: StorageProvider;
  publicBaseUrl: string;
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  accessKeySecret: string;
  uploadDir: string;
  updatedAt: string;
}

export function getStorageConfig() {
  return request.get<unknown, StorageConfig>('/storage-config');
}

export function updateStorageConfig(data: StorageConfig) {
  return request.put<unknown, StorageConfig>('/storage-config', data);
}
