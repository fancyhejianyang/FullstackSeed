import request from '@/utils/request';
import type { AiWorkflowDefinition } from './knowledgeRetrievalConfig';

export type { AiWorkflowDefinition } from './knowledgeRetrievalConfig';

export interface AiWorkflow {
  id: number;
  name: string;
  workflowDefinition: AiWorkflowDefinition | null;
  aiInstruction: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiWorkflowForm {
  name: string;
  workflowDefinition: AiWorkflowDefinition;
  aiInstruction: string;
  isEnabled?: boolean;
}

export interface QueryAiWorkflowParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  isEnabled?: boolean | '';
}

export interface AiWorkflowListResult {
  list: AiWorkflow[];
  total: number;
}

export function getAiWorkflows(params: QueryAiWorkflowParams) {
  return request.get<unknown, AiWorkflowListResult>('/ai-workflows', { params });
}

export function getAiWorkflow(id: number) {
  return request.get<unknown, AiWorkflow>(`/ai-workflows/${id}`);
}

export function createAiWorkflow(data: AiWorkflowForm) {
  return request.post<unknown, AiWorkflow>('/ai-workflows', data);
}

export function updateAiWorkflow(id: number, data: AiWorkflowForm) {
  return request.patch<unknown, AiWorkflow>(`/ai-workflows/${id}`, data);
}

export function deleteAiWorkflow(id: number) {
  return request.delete<unknown, { id: number }>(`/ai-workflows/${id}`);
}

export function batchDeleteAiWorkflows(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>('/ai-workflows/batch-delete', {
    ids: ids.map(Number),
  });
}
