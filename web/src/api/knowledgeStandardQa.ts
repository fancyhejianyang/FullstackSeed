import request from '@/utils/request';

export type KnowledgeStandardQaStatus = 'draft' | 'pending' | 'published' | 'disabled';

export interface KnowledgeStandardQa {
  id: number;
  question: string;
  aliases: string[] | null;
  answer: string;
  status: KnowledgeStandardQaStatus;
  effectiveAt: string | null;
  expiresAt: string | null;
  sourceChatMessageId: number | null;
  sourceChunkIds: number[] | null;
  version: number;
  reviewedAt: string | null;
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
  status?: KnowledgeStandardQaStatus | '';
}

export interface KnowledgeStandardQaForm {
  question: string;
  aliases?: string[];
  answer: string;
  status?: KnowledgeStandardQaStatus;
  sourceChatMessageId?: number | null;
  sourceChunkIds?: number[];
}

export const knowledgeStandardQaStatusOptions = [
  { label: '草稿', value: 'draft' },
  { label: '待审批', value: 'pending' },
  { label: '已发布', value: 'published' },
  { label: '已停用', value: 'disabled' },
] as const;

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
