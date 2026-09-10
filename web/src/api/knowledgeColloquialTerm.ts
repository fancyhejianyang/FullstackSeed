import request from '@/utils/request';

export type KnowledgeColloquialSemanticType =
  | 'product-alias'
  | 'attribute'
  | 'business-term'
  | 'custom';

export interface KnowledgeColloquialTerm {
  id: number;
  term: string;
  replacement: string;
  semanticType: KnowledgeColloquialSemanticType;
  semanticDefinition: string;
  retrievalConfigId: number | null;
  retrievalConfigName: string | null;
  excludePhrases: string[];
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeColloquialTermListResult {
  list: KnowledgeColloquialTerm[];
  total: number;
}

export interface QueryKnowledgeColloquialTermParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  semanticType?: KnowledgeColloquialSemanticType | '';
  retrievalConfigId?: number | '';
  isEnabled?: boolean | '';
}

export interface KnowledgeColloquialTermForm {
  term: string;
  replacement: string;
  semanticType: KnowledgeColloquialSemanticType;
  semanticDefinition: string;
  retrievalConfigId?: number | null;
  excludePhrases?: string[];
  isEnabled: boolean;
}

export const knowledgeColloquialSemanticTypeOptions = [
  { label: '产品简称', value: 'product-alias' },
  { label: '属性 / 指标', value: 'attribute' },
  { label: '业务术语', value: 'business-term' },
  { label: '自定义表达', value: 'custom' },
] as const;

export function getKnowledgeColloquialTerms(params: QueryKnowledgeColloquialTermParams) {
  return request.get<unknown, KnowledgeColloquialTermListResult>(
    '/knowledge-colloquial-terms',
    { params },
  );
}

export function getKnowledgeColloquialTerm(id: number) {
  return request.get<unknown, KnowledgeColloquialTerm>(`/knowledge-colloquial-terms/${id}`);
}

export function createKnowledgeColloquialTerm(data: KnowledgeColloquialTermForm) {
  return request.post<unknown, KnowledgeColloquialTerm>('/knowledge-colloquial-terms', data);
}

export function updateKnowledgeColloquialTerm(
  id: number,
  data: KnowledgeColloquialTermForm,
) {
  return request.patch<unknown, KnowledgeColloquialTerm>(
    `/knowledge-colloquial-terms/${id}`,
    data,
  );
}

export function deleteKnowledgeColloquialTerm(id: number) {
  return request.delete<unknown, { id: number }>(`/knowledge-colloquial-terms/${id}`);
}

export function batchDeleteKnowledgeColloquialTerms(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>('/knowledge-colloquial-terms/batch-delete', {
    ids: ids.map(Number),
  });
}
