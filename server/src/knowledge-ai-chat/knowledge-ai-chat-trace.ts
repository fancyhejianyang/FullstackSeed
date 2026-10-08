import type { KnowledgeColloquialTermMatch } from '../knowledge-colloquial-terms/knowledge-colloquial-terms.service';
import type { KnowledgeRoutingRuleMatch } from '../knowledge-routing-rules/knowledge-routing-rules.service';
import type { ProductSkuChatContext } from '../product-catalog/product-catalog.service';
import type {
  KnowledgeRetrievalConfigSnapshot,
  KnowledgeRetrievalStatistics,
  KnowledgeRoutedKnowledgeBase,
} from './knowledge-ai-chat-retrieval.service';

export interface KnowledgeAiQaTraceEntry {
  id: number;
  question: string;
}

export interface KnowledgeAiQaTraceStage {
  executed: boolean;
  question: string;
  matched: boolean;
  matchedEntries: KnowledgeAiQaTraceEntry[];
  selectedEntryId: number | null;
  skippedReason: string | null;
}

export interface KnowledgeAiColloquialTrace {
  evaluated: boolean;
  inputQuestion: string;
  rewrittenQuestion: string;
  matched: boolean;
  matches: KnowledgeColloquialTermMatch[];
  semanticConstraintApplied: boolean;
  skippedReason: string | null;
}

export interface KnowledgeAiRoutingTrace {
  executed: boolean;
  matchedRules: KnowledgeRoutingRuleMatch[];
  routedKnowledgeBases: KnowledgeRoutedKnowledgeBase[];
  activeKnowledgeBaseId: number | null;
  sessionContextReused: boolean;
  inventoryQuery: boolean;
  skippedReason: string | null;
}

export interface KnowledgeAiBusinessDataTrace {
  /** 旧记录无此字段，前端结合执行阶段兼容展示。 */
  status?: 'unauthorized' | 'not_executed' | 'running' | 'matched' | 'not_matched' | 'failed';
  queryKeywords?: string[];
  keywordSource?: 'ai' | 'fallback';
  authorized: boolean;
  executed: boolean;
  matched: boolean;
  context: ProductSkuChatContext | null;
  skippedReason: string | null;
}

export interface KnowledgeAiProcessingTrace {
  version: 1;
  execution?: KnowledgeAiExecutionTrace;
  retrievalConfig: KnowledgeRetrievalConfigSnapshot | null;
  originalQa: KnowledgeAiQaTraceStage;
  colloquial: KnowledgeAiColloquialTrace;
  calibratedQa: KnowledgeAiQaTraceStage;
  routing: KnowledgeAiRoutingTrace;
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
  businessData: KnowledgeAiBusinessDataTrace;
}

export interface KnowledgeAiExecutionTrace {
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  stages: Array<{
    name: string;
    status: 'running' | 'success' | 'failed';
    startedAt: string;
    finishedAt: string | null;
    elapsedMilliseconds: number;
    errorMessage: string | null;
  }>;
}
