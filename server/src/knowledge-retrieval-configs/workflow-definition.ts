export type AiWorkflowStepType =
  | 'preflight'
  | 'standardQa'
  | 'colloquial'
  | 'calibratedStandardQa'
  | 'businessCommand'
  | 'knowledgeRetrieval'
  | 'rerank'
  | 'answer';

export interface AiWorkflowStepDefinition {
  id: AiWorkflowStepType;
  type: AiWorkflowStepType;
  enabled: boolean;
}

export interface AiWorkflowDefinition {
  version: 1;
  steps: AiWorkflowStepDefinition[];
}

export interface AiWorkflowLegacyFlags {
  enableStandardQa?: boolean;
  enableColloquial?: boolean;
  enableKnowledgeRetrieval?: boolean;
  enableBusinessCommands?: boolean;
  enableRerank?: boolean;
}

export interface AiWorkflowDerivedFlags {
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

/**
 * 受约束工作流：步骤顺序和分支由服务端固定，配置仅能启停安全步骤。
 * 这样既能可视化编排，也不会允许任意 SQL、HTTP 或不合法的循环连线。
 */
export function normalizeAiWorkflowDefinition(
  definition?: AiWorkflowDefinition | null,
  flags: AiWorkflowLegacyFlags = {},
): AiWorkflowDefinition {
  const source = new Map<AiWorkflowStepType, boolean>();
  if (definition?.steps && Array.isArray(definition.steps)) {
    definition.steps.forEach((step) => {
      if (step && AI_WORKFLOW_STEP_ORDER.includes(step.type)) {
        source.set(step.type, step.enabled !== false);
      }
    });
  }
  const standardQa =
    source.get('standardQa') ?? flags.enableStandardQa !== false;
  const knowledgeRetrieval =
    source.get('knowledgeRetrieval') ??
    flags.enableKnowledgeRetrieval !== false;
  return {
    version: 1,
    steps: AI_WORKFLOW_STEP_ORDER.map((type) => ({
      id: type,
      type,
      enabled:
        type === 'preflight' || type === 'answer'
          ? true
          : type === 'standardQa' || type === 'calibratedStandardQa'
            ? (source.get(type) ?? standardQa)
            : type === 'colloquial'
              ? (source.get(type) ?? flags.enableColloquial !== false)
              : type === 'businessCommand'
                ? (source.get(type) ?? Boolean(flags.enableBusinessCommands))
                : type === 'knowledgeRetrieval'
                  ? knowledgeRetrieval
                  : (source.get(type) ?? flags.enableRerank !== false) &&
                    knowledgeRetrieval,
    })),
  };
}

export function isAiWorkflowStepEnabled(
  definition: AiWorkflowDefinition | null | undefined,
  type: AiWorkflowStepType,
  fallback: boolean,
) {
  const step = definition?.steps?.find((item) => item.type === type);
  return step ? step.enabled !== false : fallback;
}

export function getAiWorkflowDerivedFlags(
  definition?: AiWorkflowDefinition | null,
  fallback: AiWorkflowLegacyFlags = {},
): AiWorkflowDerivedFlags {
  const normalized = normalizeAiWorkflowDefinition(definition, fallback);
  const enabled = (type: AiWorkflowStepType) =>
    isAiWorkflowStepEnabled(normalized, type, false);
  const enableKnowledgeRetrieval = enabled('knowledgeRetrieval');
  return {
    enableStandardQa: enabled('standardQa') || enabled('calibratedStandardQa'),
    enableColloquial: enabled('colloquial'),
    enableKnowledgeRetrieval,
    enableBusinessCommands: enabled('businessCommand'),
    enableRerank: enableKnowledgeRetrieval && enabled('rerank'),
  };
}
