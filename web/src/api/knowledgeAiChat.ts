import request from '@/utils/request';
import type { AiWorkflowDefinition } from './knowledgeRetrievalConfig';

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
  activeKnowledgeBaseId: number | null;
  lastRetrievalQuery: string | null;
  isSuccess: boolean;
  errorMessage: string | null;
  elapsedMilliseconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeRetrievalHit {
  key: string;
  chunkId: number | null;
  chunkIndex: number | null;
  title: string;
  knowledgeBaseId: number;
  knowledgeBaseName: string;
  sourceName: string;
  score: number;
  textScore: number;
  vectorScore: number;
  rerankScore: number | null;
}

export interface KnowledgeReferenceImage {
  url: string;
  alt: string;
  sourceName: string;
  chunkId: number | null;
}

export interface KnowledgeRetrievalConfigSnapshot {
  id: number;
  name: string;
  retrievalMode: 'fullText' | 'vector' | 'hybrid';
  topK: number;
  minScore: number;
  rrfK: number;
  textWeight: number;
  vectorWeight: number;
  workflowDefinition: AiWorkflowDefinition;
  enableStandardQa: boolean;
  enableColloquial: boolean;
  enableKnowledgeRetrieval: boolean;
  enableBusinessCommands: boolean;
  enableRerank: boolean;
  rerankAiFeatureConfigName: string | null;
}

export interface KnowledgeRetrievalStatistics {
  textCandidateCount: number;
  vectorCandidateCount: number;
  fusedCandidateCount: number;
  rerankInputCount: number;
  passedMinScoreCount: number;
  selectedCount: number;
}

export interface KnowledgeAiQaTraceEntry {
  id: number;
  question: string;
  retrievalConfigId: number | null;
}

export interface KnowledgeAiQaTraceStage {
  executed: boolean;
  question: string;
  matched: boolean;
  matchedEntries: KnowledgeAiQaTraceEntry[];
  selectedEntryId: number | null;
  skippedReason: string | null;
}

export interface KnowledgeRoutingRuleMatch {
  id: number;
  term: string;
  ruleType: 'generic' | 'alias' | 'exclusive';
  matchMode: 'contains' | 'exact';
  weight: number;
  categoryIds: number[];
  knowledgeBaseIds: number[];
}

export interface ProductSkuChatContext {
  matchType: 'sku' | 'product';
  product: {
    id: number;
    productCode: string;
    name: string;
    aliases: string[];
    category: string;
  };
  sku: {
    id: number;
    skuCode: string;
    name: string;
    specifications: Record<string, unknown>;
  } | null;
  candidateSkus: Array<{
    id: number;
    skuCode: string;
    name: string;
    specifications: Record<string, unknown>;
  }>;
}

export interface KnowledgeAiProcessingTrace {
  version: 1;
  retrievalConfig: KnowledgeRetrievalConfigSnapshot | null;
  originalQa: KnowledgeAiQaTraceStage;
  colloquial: {
    evaluated: boolean;
    inputQuestion: string;
    rewrittenQuestion: string;
    matched: boolean;
    matches: KnowledgeColloquialTermMatch[];
    semanticConstraintApplied: boolean;
    skippedReason: string | null;
  };
  calibratedQa: KnowledgeAiQaTraceStage;
  routing: {
    executed: boolean;
    matchedRules: KnowledgeRoutingRuleMatch[];
    routedKnowledgeBases: Array<{ id: number; name: string }>;
    activeKnowledgeBaseId: number | null;
    sessionContextReused: boolean;
    inventoryQuery: boolean;
    skippedReason: string | null;
  };
  retrieval: {
    executed: boolean;
    hasReference: boolean;
    statistics: KnowledgeRetrievalStatistics;
    selectedHitCount: number;
    skippedReason: string | null;
  };
  rerank: {
    configured: boolean;
    applied: boolean;
    skippedReason: string | null;
  };
  businessData: {
    authorized: boolean;
    executed: boolean;
    matched: boolean;
    context: ProductSkuChatContext | null;
    skippedReason: string | null;
  };
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
  retrievalQuery: string | null;
  retrievalConfigId: number | null;
  processingTrace: KnowledgeAiProcessingTrace | null;
  hitKnowledgeBaseIds: number[] | null;
  hitChunkIds: number[] | null;
  retrievalHits: KnowledgeRetrievalHit[] | null;
  routingRuleMatches: KnowledgeRoutingRuleMatch[] | null;
  rerankApplied: boolean;
  qaEntryId: number | null;
  colloquialTermMatches: KnowledgeColloquialTermMatch[] | null;
  qaCommandIds: string[] | null;
  businessContext: ProductSkuChatContext | null;
  isSuccess: boolean;
  errorMessage: string | null;
  elapsedMilliseconds: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
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
  isSuccess?: boolean | '';
}

export interface KnowledgeColloquialTermMatch {
  id: number;
  term: string;
  replacement: string;
  semanticType: 'product-alias' | 'attribute' | 'business-term' | 'custom';
  semanticDefinition: string;
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
      event: 'standard-qa';
      data: {
        matched: boolean;
        entryId: number | null;
        question: string | null;
      };
    }
  | {
      event: 'colloquial-terms';
      data: {
        rewrittenQuestion: string;
        matches: KnowledgeColloquialTermMatch[];
      };
    }
  | {
      event: 'delta';
      data: { content: string };
    }
  | {
      event: 'thinking';
      data: { content: string; kind: 'status' | 'summary' };
    }
  | {
      event: 'retrieval';
      data: {
        retrievalConfigId: number | null;
        hasReference: boolean;
        referenceLength: number;
        query: string;
        queryRewritten: boolean;
        routedKnowledgeBaseIds: number[];
        activeKnowledgeBaseId: number | null;
        inventoryQuery: boolean;
        rerankApplied: boolean;
        hits: KnowledgeRetrievalHit[];
        referenceImages: KnowledgeReferenceImage[];
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
        promptTokens?: number | null;
        completionTokens?: number | null;
        totalTokens?: number | null;
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
