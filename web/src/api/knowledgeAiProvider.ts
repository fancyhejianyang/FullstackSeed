import request from '@/utils/request';

export interface KnowledgeAiProvider {
  id: number;
  name: string;
  apiUrl: string;
  workspaceId: string;
  chatApiPath: string;
  models: string;
  textModels: string;
  visionModels: string;
  embeddingModels: string;
  isEnabled: boolean;
  description: string;
  secretKeySet: boolean;
  secretKeyMasked: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeAiProviderListResult {
  list: KnowledgeAiProvider[];
  total: number;
}

export interface QueryKnowledgeAiProviderParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface KnowledgeAiProviderForm {
  name: string;
  apiUrl: string;
  workspaceId?: string;
  chatApiPath?: string;
  secretKey?: string;
  models?: string;
  textModels?: string;
  visionModels?: string;
  embeddingModels?: string;
  isEnabled?: boolean;
  description?: string;
}

export interface TestKnowledgeAiProviderPayload {
  id: number;
  model: string;
  question: string;
}

export interface TestKnowledgeAiProviderResult {
  isSuccess: boolean;
  model: string;
  answer: string;
  errorMessage: string | null;
  elapsedMilliseconds: number;
}

export function getKnowledgeAiProviders(params: QueryKnowledgeAiProviderParams) {
  return request.get<unknown, KnowledgeAiProviderListResult>(
    '/knowledge-ai-providers',
    { params },
  );
}

export function getKnowledgeAiProvider(id: number) {
  return request.get<unknown, KnowledgeAiProvider>(`/knowledge-ai-providers/${id}`);
}

export function createKnowledgeAiProvider(data: KnowledgeAiProviderForm) {
  return request.post<unknown, KnowledgeAiProvider>('/knowledge-ai-providers', data);
}

export function updateKnowledgeAiProvider(
  id: number,
  data: KnowledgeAiProviderForm,
) {
  return request.patch<unknown, KnowledgeAiProvider>(
    `/knowledge-ai-providers/${id}`,
    data,
  );
}

export function deleteKnowledgeAiProvider(id: number) {
  return request.delete<unknown, { id: number }>(`/knowledge-ai-providers/${id}`);
}

export function batchDeleteKnowledgeAiProviders(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>(
    '/knowledge-ai-providers/batch-delete',
    { ids: ids.map(Number) },
  );
}

export function testKnowledgeAiProvider(data: TestKnowledgeAiProviderPayload) {
  return request.post<unknown, TestKnowledgeAiProviderResult>(
    '/knowledge-ai-providers/test',
    data,
  );
}
