import request from '@/utils/request';

export type KnowledgeRoutingRuleType = 'generic' | 'alias' | 'exclusive';
export type KnowledgeRoutingMatchMode = 'contains' | 'exact';

export interface KnowledgeRoutingRule {
  id: number;
  term: string;
  ruleType: KnowledgeRoutingRuleType;
  matchMode: KnowledgeRoutingMatchMode;
  weight: number;
  retrievalConfigId: number;
  retrievalConfigName: string;
  knowledgeBaseIds: number[];
  knowledgeBaseNames: string;
  documentIds: number[];
  documentNames: string;
  isEnabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeRoutingRuleListResult {
  list: KnowledgeRoutingRule[];
  total: number;
}

export interface QueryKnowledgeRoutingRuleParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  ruleType?: KnowledgeRoutingRuleType | '';
  retrievalConfigId?: number | '';
  isEnabled?: boolean | '';
}

export interface KnowledgeRoutingRuleForm {
  term: string;
  ruleType: KnowledgeRoutingRuleType;
  matchMode: KnowledgeRoutingMatchMode;
  weight: number;
  retrievalConfigId: number;
  knowledgeBaseIds: number[];
  documentIds: number[];
  isEnabled: boolean;
  description?: string;
}

export const knowledgeRoutingRuleTypeOptions = [
  { label: '公共词降权', value: 'generic' },
  { label: '别名升权', value: 'alias' },
  { label: '专属路由', value: 'exclusive' },
] as const;

export const knowledgeRoutingMatchModeOptions = [
  { label: '包含匹配', value: 'contains' },
  { label: '精确匹配', value: 'exact' },
] as const;

export function getKnowledgeRoutingRules(params: QueryKnowledgeRoutingRuleParams) {
  return request.get<unknown, KnowledgeRoutingRuleListResult>(
    '/knowledge-routing-rules',
    { params },
  );
}

export function getKnowledgeRoutingRule(id: number) {
  return request.get<unknown, KnowledgeRoutingRule>(
    `/knowledge-routing-rules/${id}`,
  );
}

export function createKnowledgeRoutingRule(data: KnowledgeRoutingRuleForm) {
  return request.post<unknown, KnowledgeRoutingRule>('/knowledge-routing-rules', data);
}

export function updateKnowledgeRoutingRule(
  id: number,
  data: KnowledgeRoutingRuleForm,
) {
  return request.patch<unknown, KnowledgeRoutingRule>(
    `/knowledge-routing-rules/${id}`,
    data,
  );
}

export function deleteKnowledgeRoutingRule(id: number) {
  return request.delete<unknown, { id: number }>(`/knowledge-routing-rules/${id}`);
}

export function batchDeleteKnowledgeRoutingRules(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>(
    '/knowledge-routing-rules/batch-delete',
    { ids: ids.map(Number) },
  );
}
