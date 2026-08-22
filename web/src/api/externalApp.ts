import request from '@/utils/request';

export interface ExternalApp {
  id: number;
  name: string;
  appId: string;
  domain: string | null;
  aiFeatureConfigId: number | null;
  aiFeatureConfigName: string | null;
  retrievalConfigId: number | null;
  retrievalConfigName: string | null;
  isEnabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalAppListResult {
  list: ExternalApp[];
  total: number;
}

export interface QueryExternalAppParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface ExternalAppForm {
  name: string;
  appId?: string;
  domain?: string;
  aiFeatureConfigId?: number | null;
  retrievalConfigId?: number | null;
  isEnabled?: boolean;
  description?: string;
}

export function getExternalApps(params: QueryExternalAppParams) {
  return request.get<unknown, ExternalAppListResult>('/external-apps', {
    params,
  });
}

export function getExternalApp(id: number) {
  return request.get<unknown, ExternalApp>(`/external-apps/${id}`);
}

export function createExternalApp(data: ExternalAppForm) {
  return request.post<unknown, ExternalApp>('/external-apps', data);
}

export function updateExternalApp(id: number, data: ExternalAppForm) {
  return request.patch<unknown, ExternalApp>(`/external-apps/${id}`, data);
}

export function deleteExternalApp(id: number) {
  return request.delete<unknown, { id: number }>(`/external-apps/${id}`);
}

export function batchDeleteExternalApps(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>(
    '/external-apps/batch-delete',
    { ids: ids.map(Number) },
  );
}
