import type {
  AiWorkflowDefinition,
  AiWorkflowStepType,
  KnowledgeRetrievalConfig,
} from '@/api/knowledgeRetrievalConfig';

export interface AiWorkflowFlags {
  enableStandardQa: boolean;
  enableColloquial: boolean;
  enableKnowledgeRetrieval: boolean;
  enableBusinessCommands: boolean;
  enableRerank: boolean;
}

export const AI_WORKFLOW_STEP_ORDER: AiWorkflowStepType[] = [
  'preflight',
  'standardQa',
  'colloquial',
  'calibratedStandardQa',
  'businessCommand',
  'knowledgeRetrieval',
  'rerank',
  'answer',
];

export const AI_WORKFLOW_STEP_META: Record<
  AiWorkflowStepType,
  { title: string; description: string; kind: 'fixed' | 'decision' | 'action' | 'terminal' }
> = {
  preflight: {
    title: '输入清洗与权限范围',
    description: '确认会话、权限和可用范围；属于安全前置步骤，不能关闭。',
    kind: 'fixed',
  },
  standardQa: {
    title: '原问题标准问答',
    description: '命中后直接返回固定答案；未命中后进入口语校准。',
    kind: 'decision',
  },
  colloquial: {
    title: '口语化校准',
    description: '使用人工维护词库改写问题，并附加语义约束。',
    kind: 'action',
  },
  calibratedStandardQa: {
    title: '校准后标准问答',
    description: '用校准后的问题再次精确匹配固定问答。',
    kind: 'decision',
  },
  businessCommand: {
    title: '业务数据指令',
    description: '仅能调用聊天应用已授权的只读业务指令。',
    kind: 'action',
  },
  knowledgeRetrieval: {
    title: '路由与知识库检索',
    description: '执行路由、全文/向量召回、阈值筛选和资料汇总。',
    kind: 'action',
  },
  rerank: {
    title: 'LLM 重排',
    description: '对候选资料重新评分排序；仅在知识库检索开启时可用。',
    kind: 'action',
  },
  answer: {
    title: '回答生成与审计',
    description: '结合获准资料生成回答，并记录完整执行轨迹。',
    kind: 'terminal',
  },
};

export function normalizeAiWorkflowDefinition(
  definition?: AiWorkflowDefinition | null,
  fallback: Partial<AiWorkflowFlags> = {},
): AiWorkflowDefinition {
  const source = new Map<AiWorkflowStepType, boolean>();
  definition?.steps?.forEach((step) => {
    if (AI_WORKFLOW_STEP_ORDER.includes(step.type)) {
      source.set(step.type, step.enabled !== false);
    }
  });
  const standardQa =
    source.get('standardQa') ?? (fallback.enableStandardQa !== false);
  const retrieval =
    source.get('knowledgeRetrieval') ??
    (fallback.enableKnowledgeRetrieval !== false);
  return {
    version: 1,
    steps: AI_WORKFLOW_STEP_ORDER.map((type) => ({
      id: type,
      type,
      enabled:
        type === 'preflight' || type === 'answer'
          ? true
          : type === 'standardQa' || type === 'calibratedStandardQa'
            ? source.get(type) ?? standardQa
            : type === 'colloquial'
              ? source.get(type) ?? (fallback.enableColloquial !== false)
              : type === 'businessCommand'
                ? source.get(type) ?? Boolean(fallback.enableBusinessCommands)
                : type === 'knowledgeRetrieval'
                  ? retrieval
                  : (source.get(type) ?? (fallback.enableRerank !== false)) && retrieval,
    })),
  };
}

export function isAiWorkflowStepEnabled(
  definition: AiWorkflowDefinition,
  type: AiWorkflowStepType,
) {
  const step = definition.steps.find((item) => item.type === type);
  return step ? step.enabled !== false : false;
}

export function getAiWorkflowFlags(
  definition?: AiWorkflowDefinition | null,
  fallback: Partial<AiWorkflowFlags> = {},
): AiWorkflowFlags {
  const normalized = normalizeAiWorkflowDefinition(definition, fallback);
  const enabled = (type: AiWorkflowStepType) =>
    isAiWorkflowStepEnabled(normalized, type);
  const enableKnowledgeRetrieval = enabled('knowledgeRetrieval');
  return {
    enableStandardQa: enabled('standardQa') || enabled('calibratedStandardQa'),
    enableColloquial: enabled('colloquial'),
    enableKnowledgeRetrieval,
    enableBusinessCommands: enabled('businessCommand'),
    enableRerank: enableKnowledgeRetrieval && enabled('rerank'),
  };
}

export function getWorkflowFallbackFlags(config: KnowledgeRetrievalConfig) {
  return {
    enableStandardQa: config.enableStandardQa,
    enableColloquial: config.enableColloquial,
    enableKnowledgeRetrieval: config.enableKnowledgeRetrieval,
    enableBusinessCommands: config.enableBusinessCommands,
    enableRerank: config.enableRerank,
  } satisfies AiWorkflowFlags;
}
