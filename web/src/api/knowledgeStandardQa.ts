import request from '@/utils/request';

export interface KnowledgeStandardQa {
  id: number;
  question: string;
  aliases: string[] | null;
  answer: string;
  isActive: boolean;
  effectiveAt: string | null;
  expiresAt: string | null;
  sourceChatMessageId: number | null;
  sourceChunkIds: number[] | null;
  version: number;
  hitCount: number;
  lastHitAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeStandardQaListResult {
  list: KnowledgeStandardQa[];
  total: number;
}

export interface QueryKnowledgeStandardQaParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  isActive?: boolean | '';
}

export interface KnowledgeStandardQaForm {
  question: string;
  aliases?: string[];
  answer: string;
  isActive?: boolean;
  sourceChatMessageId?: number | null;
  sourceChunkIds?: number[];
}

export function getKnowledgeStandardQas(params: QueryKnowledgeStandardQaParams) {
  return request.get<unknown, KnowledgeStandardQaListResult>('/knowledge-standard-qas', {
    params,
  });
}

export function getKnowledgeStandardQa(id: number) {
  return request.get<unknown, KnowledgeStandardQa>(`/knowledge-standard-qas/${id}`);
}

export function createKnowledgeStandardQa(data: KnowledgeStandardQaForm) {
  return request.post<unknown, KnowledgeStandardQa>('/knowledge-standard-qas', data);
}

export function updateKnowledgeStandardQa(id: number, data: KnowledgeStandardQaForm) {
  return request.patch<unknown, KnowledgeStandardQa>(`/knowledge-standard-qas/${id}`, data);
}

export function deleteKnowledgeStandardQa(id: number) {
  return request.delete<unknown, { id: number }>(`/knowledge-standard-qas/${id}`);
}

export function batchDeleteKnowledgeStandardQas(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>('/knowledge-standard-qas/batch-delete', {
    ids: ids.map(Number),
  });
}
