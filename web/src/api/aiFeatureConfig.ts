import request from '@/utils/request';

export type AiFeatureType = 'chat' | 'documentParse' | 'ocr' | 'embedding';
export type AiResponseFormat = 'text' | 'json' | 'markdown';

export interface AiFeatureConfig {
  id: number;
  name: string;
  featureType: AiFeatureType;
  providerId: number | null;
  providerName: string | null;
  model: string | null;
  useMineru: boolean;
  mineruConfigId: number | null;
  mineruConfigName: string | null;
  systemPrompt: string | null;
  rules: string | null;
  responseFormat: AiResponseFormat;
  isEnabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiFeatureConfigListResult {
  list: AiFeatureConfig[];
  total: number;
}

export interface QueryAiFeatureConfigParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  featureType?: AiFeatureType | '';
  providerId?: number | '';
}

export interface AiFeatureConfigForm {
  name: string;
  featureType: AiFeatureType;
  providerId?: number | '' | null;
  model?: string;
  useMineru?: boolean;
  mineruConfigId?: number | '' | null;
  systemPrompt?: string;
  rules?: string;
  responseFormat?: AiResponseFormat;
  isEnabled?: boolean;
  description?: string;
}

export function getAiFeatureConfigs(params: QueryAiFeatureConfigParams) {
  return request.get<unknown, AiFeatureConfigListResult>('/ai-feature-configs', {
    params,
  });
}

export function getAiFeatureConfig(id: number) {
  return request.get<unknown, AiFeatureConfig>(`/ai-feature-configs/${id}`);
}

export function createAiFeatureConfig(data: AiFeatureConfigForm) {
  return request.post<unknown, AiFeatureConfig>('/ai-feature-configs', data);
}

export function updateAiFeatureConfig(id: number, data: AiFeatureConfigForm) {
  return request.patch<unknown, AiFeatureConfig>(`/ai-feature-configs/${id}`, data);
}

export function deleteAiFeatureConfig(id: number) {
  return request.delete<unknown, { id: number }>(`/ai-feature-configs/${id}`);
}

export function batchDeleteAiFeatureConfigs(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>(
    '/ai-feature-configs/batch-delete',
    { ids: ids.map(Number) },
  );
}
