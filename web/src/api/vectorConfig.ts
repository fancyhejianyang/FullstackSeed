import request from '@/utils/request';

export type VectorDbType = 'chroma';

export interface VectorConfig {
  id: number;
  name: string;
  vectorDbType: VectorDbType;
  chromaUrl: string;
  collectionName: string;
  tenant: string;
  database: string;
  tokenSet: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VectorConfigListResult {
  list: VectorConfig[];
  total: number;
}

export interface QueryVectorConfigParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface VectorConfigForm {
  name: string;
  vectorDbType?: VectorDbType;
  chromaUrl: string;
  collectionName?: string;
  tenant?: string;
  database?: string;
  token?: string;
  isEnabled?: boolean;
}

export function getVectorConfigs(params: QueryVectorConfigParams) {
  return request.get<unknown, VectorConfigListResult>('/vector-configs', {
    params,
  });
}

export function getVectorConfig(id: number) {
  return request.get<unknown, VectorConfig>(`/vector-configs/${id}`);
}

export function createVectorConfig(data: VectorConfigForm) {
  return request.post<unknown, VectorConfig>('/vector-configs', data);
}

export function updateVectorConfig(id: number, data: VectorConfigForm) {
  return request.patch<unknown, VectorConfig>(`/vector-configs/${id}`, data);
}

export function deleteVectorConfig(id: number) {
  return request.delete<unknown, { id: number }>(`/vector-configs/${id}`);
}

export function batchDeleteVectorConfigs(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>('/vector-configs/batch-delete', {
    ids: ids.map(Number),
  });
}
