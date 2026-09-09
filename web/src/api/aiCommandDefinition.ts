import request from '@/utils/request';

export type AiCommandAction = 'read' | 'create' | 'update' | 'delete' | 'execute';
export type AiCommandExecutionMode = 'service' | 'api';

export interface AiCommandDefinition {
  id: number;
  commandKey: string;
  name: string;
  semanticKeywords: string[] | null;
  action: AiCommandAction;
  executionMode: AiCommandExecutionMode;
  handlerKey: string;
  executionTarget: string;
  apiMethod: string;
  apiPath: string;
  requestSchema: string;
  contextBindings: string;
  chatCallable: boolean;
  requireApproval: boolean;
  isEnabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiCommandDefinitionListResult {
  list: AiCommandDefinition[];
  total: number;
}

export interface QueryAiCommandDefinitionParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  chatCallable?: boolean | '';
  isEnabled?: boolean | '';
}

export interface UpdateAiCommandDefinitionForm {
  name?: string;
  semanticKeywords?: string[];
  requestSchema?: string;
  contextBindings?: string;
  chatCallable?: boolean;
  requireApproval?: boolean;
  isEnabled?: boolean;
  description?: string;
}

export function getAiCommandDefinitions(params: QueryAiCommandDefinitionParams) {
  return request.get<unknown, AiCommandDefinitionListResult>('/ai-command-definitions', {
    params,
  });
}

export function getAiCommandDefinition(id: number) {
  return request.get<unknown, AiCommandDefinition>(`/ai-command-definitions/${id}`);
}

export function updateAiCommandDefinition(id: number, data: UpdateAiCommandDefinitionForm) {
  return request.patch<unknown, AiCommandDefinition>(`/ai-command-definitions/${id}`, data);
}
