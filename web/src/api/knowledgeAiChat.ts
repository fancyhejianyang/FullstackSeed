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
  hitKnowledgeBaseNames: string | null;
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
  hitKnowledgeBaseNames: string | null;
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
  providerId?: number;
  aiFeatureConfigId?: number;
  retrievalConfigId?: number;
  model?: string;
  question: string;
  sessionId?: number;
  systemPrompt?: string;
  title?: string;
}

export interface AskKnowledgeAiResult {
  session: KnowledgeAiChatSession;
  message: KnowledgeAiChatMessage;
}

export interface InitKnowledgeAiSessionPayload {
  model?: string;
  title?: string;
}

export interface InitKnowledgeAiSessionResult {
  sessionId: number;
  title: string;
  providerId: number;
  providerName: string;
  model: string;
  aiFeatureConfigId?: number | null;
  aiFeatureConfigName?: string | null;
  retrievalConfigId?: number | null;
  retrievalConfigName?: string | null;
}

export interface AppChatRequestOptions {
  appId: string;
  signal?: AbortSignal;
}

export type KnowledgeAiChatStreamEvent =
  | {
      event: 'meta';
      data: {
        sessionId: number;
        providerId: number;
        providerName: string;
        model: string;
        aiFeatureConfigId?: number | null;
        aiFeatureConfigName?: string | null;
        retrievalConfigId?: number | null;
        retrievalConfigName?: string | null;
      };
    }
  | {
      event: 'delta';
      data: { content: string };
    }
  | {
      event: 'retrieval';
      data: {
        retrievalConfigId: number | null;
        hasReference: boolean;
        referenceLength: number;
      };
    }
  | {
      event: 'error';
      data: {
        message?: string;
        errorMessage?: string | null;
        isSuccess?: boolean;
      };
    }
  | {
      event: 'done';
      data: {
        sessionId: number;
        messageId: number;
        isSuccess: boolean;
        model: string;
        answer: string;
        errorMessage: string | null;
        elapsedMilliseconds: number;
      };
    };

export interface AskKnowledgeAiStreamOptions {
  appId: string;
  signal?: AbortSignal;
  onEvent: (event: KnowledgeAiChatStreamEvent) => void;
}

export function askKnowledgeAi(data: AskKnowledgeAiPayload) {
  return request.post<unknown, AskKnowledgeAiResult>('/knowledge-ai-chat/ask', data);
}

export async function initKnowledgeAiSession(
  data: InitKnowledgeAiSessionPayload,
  options: AppChatRequestOptions,
) {
  const response = await fetch(
    `${getApiBaseUrl()}/knowledge-ai-chat/sessions/init`,
    {
      method: 'POST',
      headers: {
        appid: options.appId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: options.signal,
    },
  );
  if (!response.ok) {
    throw new Error(`AI 会话初始化失败：${response.status}`);
  }
  const result = await response.json();
  return result.data as InitKnowledgeAiSessionResult;
}

export async function askKnowledgeAiStream(
  data: AskKnowledgeAiPayload,
  options: AskKnowledgeAiStreamOptions,
) {
  const response = await fetch(`${getApiBaseUrl()}/knowledge-ai-chat/ask/stream`, {
    method: 'POST',
    headers: {
      appid: options.appId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
    signal: options.signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`AI 流式请求失败：${response.status}`);
  }

  await readSseStream(response.body, options.onEvent);
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

async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: KnowledgeAiChatStreamEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? '';
    blocks.forEach((block) => emitSseBlock(block, onEvent));
  }

  buffer += decoder.decode();
  if (buffer.trim()) emitSseBlock(buffer, onEvent);
}

function emitSseBlock(
  block: string,
  onEvent: (event: KnowledgeAiChatStreamEvent) => void,
) {
  const eventName =
    block
      .split(/\r?\n/)
      .find((line) => line.startsWith('event:'))
      ?.slice(6)
      .trim() || 'message';
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');
  if (!data) return;
  onEvent({
    event: eventName,
    data: JSON.parse(data),
  } as KnowledgeAiChatStreamEvent);
}

function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL || '/api';
}
