import request from '@/utils/request';

export type MineruAuthMode = 'Bearer' | 'TokenHeader';

export interface MineruConfig {
  id: number;
  name: string;
  baseUrl: string;
  authMode: MineruAuthMode;
  modelVersion: string;
  createTaskPath: string;
  queryTaskPath: string;
  pollIntervalSeconds: number;
  timeoutMinutes: number;
  isOcr: boolean;
  enableFormula: boolean;
  enableTable: boolean;
  isEnabled: boolean;
  tokenSet: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MineruConfigListResult {
  list: MineruConfig[];
  total: number;
}

export interface QueryMineruConfigParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface MineruConfigForm {
  name: string;
  baseUrl: string;
  token?: string;
  authMode?: MineruAuthMode;
  modelVersion?: string;
  createTaskPath?: string;
  queryTaskPath?: string;
  pollIntervalSeconds?: number;
  timeoutMinutes?: number;
  isOcr?: boolean;
  enableFormula?: boolean;
  enableTable?: boolean;
  isEnabled?: boolean;
}

export function getMineruConfigs(params: QueryMineruConfigParams) {
  return request.get<unknown, MineruConfigListResult>('/mineru-configs', {
    params,
  });
}

export function getMineruConfig(id: number) {
  return request.get<unknown, MineruConfig>(`/mineru-configs/${id}`);
}

export function createMineruConfig(data: MineruConfigForm) {
  return request.post<unknown, MineruConfig>('/mineru-configs', data);
}

export function updateMineruConfig(id: number, data: MineruConfigForm) {
  return request.patch<unknown, MineruConfig>(`/mineru-configs/${id}`, data);
}

export function deleteMineruConfig(id: number) {
  return request.delete<unknown, { id: number }>(`/mineru-configs/${id}`);
}

export function batchDeleteMineruConfigs(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>('/mineru-configs/batch-delete', {
    ids: ids.map(Number),
  });
}
