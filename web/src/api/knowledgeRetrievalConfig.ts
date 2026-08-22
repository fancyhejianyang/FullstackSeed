import request from '@/utils/request';

export type KnowledgeRetrievalMode = 'fullText' | 'vector' | 'hybrid';

export interface KnowledgeRetrievalConfig {
  id: number;
  name: string;
  retrievalMode: KnowledgeRetrievalMode;
  categoryIds: number[] | null;
  categoryNames: string | null;
  knowledgeBaseIds: number[] | null;
  knowledgeBaseNames: string | null;
  topK: number;
  minScore: number;
  rrfK: number;
  textWeight: number;
  vectorWeight: number;
  enableRerank: boolean;
  rerankAiFeatureConfigId: number | null;
  rerankAiFeatureConfigName: string | null;
  isEnabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeRetrievalConfigListResult {
  list: KnowledgeRetrievalConfig[];
  total: number;
}

export interface QueryKnowledgeRetrievalConfigParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  retrievalMode?: KnowledgeRetrievalMode | '';
}

export interface KnowledgeRetrievalConfigForm {
  name: string;
  retrievalMode?: KnowledgeRetrievalMode;
  categoryIds?: number[];
  knowledgeBaseIds?: number[];
  topK?: number | null;
  minScore?: number | null;
  rrfK?: number | null;
  textWeight?: number | null;
  vectorWeight?: number | null;
  enableRerank?: boolean;
  rerankAiFeatureConfigId?: number | null;
  isEnabled?: boolean;
  description?: string;
}

export function getKnowledgeRetrievalConfigs(
  params: QueryKnowledgeRetrievalConfigParams,
) {
  return request.get<unknown, KnowledgeRetrievalConfigListResult>(
    '/knowledge-retrieval-configs',
    { params },
  );
}

export function getKnowledgeRetrievalConfig(id: number) {
  return request.get<unknown, KnowledgeRetrievalConfig>(
    `/knowledge-retrieval-configs/${id}`,
  );
}

export function createKnowledgeRetrievalConfig(
  data: KnowledgeRetrievalConfigForm,
) {
  return request.post<unknown, KnowledgeRetrievalConfig>(
    '/knowledge-retrieval-configs',
    data,
  );
}

export function updateKnowledgeRetrievalConfig(
  id: number,
  data: KnowledgeRetrievalConfigForm,
) {
  return request.patch<unknown, KnowledgeRetrievalConfig>(
    `/knowledge-retrieval-configs/${id}`,
    data,
  );
}

export function deleteKnowledgeRetrievalConfig(id: number) {
  return request.delete<unknown, { id: number }>(
    `/knowledge-retrieval-configs/${id}`,
  );
}

export function batchDeleteKnowledgeRetrievalConfigs(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>(
    '/knowledge-retrieval-configs/batch-delete',
    { ids: ids.map(Number) },
  );
}
