import request from '@/utils/request';

export interface KnowledgeAiChatSession {
  id: number;
  title: string;
  providerId: number;
  providerName: string;
  model: string;
  messageCount: number;
  lastQuestion: string | null;
  lastAnswer: string | null;
  isSuccess: boolean;
  errorMessage: string | null;
  elapsedMilliseconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeAiChatMessage {
  id: number;
  sessionId: number;
  providerId: number;
  providerName: string;
  model: string;
  systemPrompt: string | null;
  question: string;
  answer: string | null;
  isSuccess: boolean;
  errorMessage: string | null;
  elapsedMilliseconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeAiChatSessionDetail extends KnowledgeAiChatSession {
  messages: KnowledgeAiChatMessage[];
}

export interface KnowledgeAiChatSessionListResult {
  list: KnowledgeAiChatSession[];
  total: number;
}

export interface QueryKnowledgeAiChatSessionParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  providerId?: number;
}

export interface AskKnowledgeAiPayload {
  providerId: number;
  model: string;
  question: string;
  sessionId?: number;
  systemPrompt?: string;
  title?: string;
}

export interface AskKnowledgeAiResult {
  session: KnowledgeAiChatSession;
  message: KnowledgeAiChatMessage;
}

export function askKnowledgeAi(data: AskKnowledgeAiPayload) {
  return request.post<unknown, AskKnowledgeAiResult>('/knowledge-ai-chat/ask', data);
}

export function getKnowledgeAiChatSessions(
  params: QueryKnowledgeAiChatSessionParams,
) {
  return request.get<unknown, KnowledgeAiChatSessionListResult>(
    '/knowledge-ai-chat/sessions',
    { params },
  );
}

export function getKnowledgeAiChatSession(id: number) {
  return request.get<unknown, KnowledgeAiChatSessionDetail>(
    `/knowledge-ai-chat/sessions/${id}`,
  );
}

export function deleteKnowledgeAiChatSession(id: number) {
  return request.delete<unknown, { id: number }>(`/knowledge-ai-chat/sessions/${id}`);
}

export function batchDeleteKnowledgeAiChatSessions(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>(
    '/knowledge-ai-chat/sessions/batch-delete',
    { ids: ids.map(Number) },
  );
}
