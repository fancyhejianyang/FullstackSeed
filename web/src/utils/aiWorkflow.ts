import type {
  AiWorkflowDefinition,
  AiWorkflowEdgeCondition,
  AiWorkflowEdgeDefinition,
  AiWorkflowNodeDefinition,
  AiWorkflowNodePosition,
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

export interface AiWorkflowExecutionPlan extends AiWorkflowFlags {
  enableOriginalStandardQa: boolean;
  enableCalibratedStandardQa: boolean;
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

const FIXED_NODE_TYPES = new Set<AiWorkflowStepType>(['preflight', 'answer']);
const PASS_THROUGH_CONDITIONS = new Set<AiWorkflowEdgeCondition>([
  'always',
  'unmatched',
]);
const WORKFLOW_CANVAS_WIDTH = 650;
const WORKFLOW_NODE_WIDTH = 160;
const WORKFLOW_CANVAS_PADDING = 20;

export const AI_WORKFLOW_STEP_META: Record<
  AiWorkflowStepType,
  { title: string; description: string; kind: 'fixed' | 'decision' | 'action' | 'terminal' }
> = {
  preflight: {
    title: '输入清洗与权限范围',
    description: '确认会话、权限和可用范围；属于安全前置步骤，不能删除或关闭。',
    kind: 'fixed',
  },
  standardQa: {
    title: '原问题标准问答',
    description: '命中后可直接进入回答；未命中可继续口语校准、业务数据或知识库检索。',
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
    description: '对候选资料重新评分排序；仅在知识库检索可达时会执行。',
    kind: 'action',
  },
  answer: {
    title: '回答生成与审计',
    description: '结合获准资料生成回答，并记录完整执行轨迹。',
    kind: 'terminal',
  },
};

export const AI_WORKFLOW_CONDITION_META: Record<
  AiWorkflowEdgeCondition,
  { label: string; description: string }
> = {
  always: { label: '始终继续', description: '当前节点完成后继续执行此连线。' },
  matched: { label: '命中', description: '标准问答命中固定答案时进入此连线。' },
  unmatched: { label: '未命中', description: '标准问答未命中固定答案时进入此连线。' },
};

const DEFAULT_NODE_POSITIONS: Record<AiWorkflowStepType, AiWorkflowNodePosition> = {
  preflight: { x: 245, y: 30 },
  standardQa: { x: 245, y: 155 },
  colloquial: { x: 245, y: 285 },
  calibratedStandardQa: { x: 245, y: 410 },
  businessCommand: { x: 95, y: 555 },
  knowledgeRetrieval: { x: 395, y: 555 },
  rerank: { x: 395, y: 680 },
  answer: { x: 245, y: 810 },
};

const LEGACY_DEFAULT_NODE_POSITIONS: Record<
  AiWorkflowStepType,
  AiWorkflowNodePosition
> = {
  preflight: { x: 430, y: 30 },
  standardQa: { x: 430, y: 155 },
  colloquial: { x: 430, y: 285 },
  calibratedStandardQa: { x: 430, y: 410 },
  businessCommand: { x: 180, y: 555 },
  knowledgeRetrieval: { x: 680, y: 555 },
  rerank: { x: 680, y: 680 },
  answer: { x: 430, y: 810 },
};

const COMPACT_DEFAULT_NODE_POSITIONS: Record<
  AiWorkflowStepType,
  AiWorkflowNodePosition
> = {
  preflight: { x: 230, y: 30 },
  standardQa: { x: 230, y: 155 },
  colloquial: { x: 230, y: 285 },
  calibratedStandardQa: { x: 230, y: 410 },
  businessCommand: { x: 80, y: 555 },
  knowledgeRetrieval: { x: 380, y: 555 },
  rerank: { x: 380, y: 680 },
  answer: { x: 230, y: 810 },
};

function isStepType(value: unknown): value is AiWorkflowStepType {
  return typeof value === 'string' && AI_WORKFLOW_STEP_ORDER.includes(value as AiWorkflowStepType);
}

function isCondition(value: unknown): value is AiWorkflowEdgeCondition {
  return value === 'always' || value === 'matched' || value === 'unmatched';
}

function nodeId(type: AiWorkflowStepType) {
  return `node-${type}`;
}

function normalizePosition(
  type: AiWorkflowStepType,
  position?: AiWorkflowNodePosition,
): AiWorkflowNodePosition {
  const fallback = DEFAULT_NODE_POSITIONS[type];
  const legacy = LEGACY_DEFAULT_NODE_POSITIONS[type];
  const compact = COMPACT_DEFAULT_NODE_POSITIONS[type];
  const x = Number(position?.x);
  const y = Number(position?.y);
  if (
    (x === legacy.x && y === legacy.y) ||
    (x === compact.x && y === compact.y)
  ) {
    return fallback;
  }
  return {
    x: Number.isFinite(x)
      ? Math.min(
          WORKFLOW_CANVAS_WIDTH - WORKFLOW_NODE_WIDTH - WORKFLOW_CANVAS_PADDING,
          Math.max(WORKFLOW_CANVAS_PADDING, Math.round(x)),
        )
      : fallback.x,
    y: Number.isFinite(y) ? Math.min(920, Math.max(20, Math.round(y))) : fallback.y,
  };
}

function defaultEnabled(type: AiWorkflowStepType, fallback: Partial<AiWorkflowFlags>) {
  if (FIXED_NODE_TYPES.has(type)) return true;
  if (type === 'standardQa' || type === 'calibratedStandardQa') {
    return fallback.enableStandardQa !== false;
  }
  if (type === 'colloquial') return fallback.enableColloquial !== false;
  if (type === 'businessCommand') return Boolean(fallback.enableBusinessCommands);
  if (type === 'knowledgeRetrieval') return fallback.enableKnowledgeRetrieval !== false;
  return fallback.enableKnowledgeRetrieval !== false && fallback.enableRerank !== false;
}

function defaultNodes(fallback: Partial<AiWorkflowFlags>) {
  return AI_WORKFLOW_STEP_ORDER.map((type) => ({
    id: nodeId(type),
    type,
    enabled: defaultEnabled(type, fallback),
    position: normalizePosition(type),
  }));
}

function defaultEdges(nodes: AiWorkflowNodeDefinition[]) {
  const byType = new Map(nodes.map((node) => [node.type, node]));
  const rows: Array<[AiWorkflowStepType, AiWorkflowStepType, AiWorkflowEdgeCondition]> = [
    ['preflight', 'standardQa', 'always'],
    ['standardQa', 'answer', 'matched'],
    ['standardQa', 'colloquial', 'unmatched'],
    ['colloquial', 'calibratedStandardQa', 'always'],
    ['calibratedStandardQa', 'answer', 'matched'],
    ['calibratedStandardQa', 'businessCommand', 'unmatched'],
    ['businessCommand', 'knowledgeRetrieval', 'always'],
    ['knowledgeRetrieval', 'rerank', 'always'],
    ['rerank', 'answer', 'always'],
  ];
  return rows.flatMap(([sourceType, targetType, condition]) => {
    const source = byType.get(sourceType);
    const target = byType.get(targetType);
    return source && target
      ? [{ id: `edge-${source.id}-${target.id}-${condition}`, source: source.id, target: target.id, condition }]
      : [];
  });
}

export function isSafeWorkflowEdge(
  sourceType: AiWorkflowStepType,
  targetType: AiWorkflowStepType,
  condition: AiWorkflowEdgeCondition,
) {
  if (sourceType === targetType) return false;
  if (sourceType === 'preflight') {
    return condition === 'always' && ['standardQa', 'colloquial', 'businessCommand', 'knowledgeRetrieval', 'answer'].includes(targetType);
  }
  if (sourceType === 'standardQa' || sourceType === 'calibratedStandardQa') {
    if (targetType === 'answer') return condition === 'matched' || condition === 'unmatched';
    const allowed = sourceType === 'standardQa'
      ? ['colloquial', 'businessCommand', 'knowledgeRetrieval']
      : ['businessCommand', 'knowledgeRetrieval'];
    return condition === 'unmatched' && allowed.includes(targetType);
  }
  if (sourceType === 'colloquial') {
    return condition === 'always' && ['calibratedStandardQa', 'businessCommand', 'knowledgeRetrieval', 'answer'].includes(targetType);
  }
  if (sourceType === 'businessCommand') {
    return condition === 'always' && ['knowledgeRetrieval', 'answer'].includes(targetType);
  }
  if (sourceType === 'knowledgeRetrieval') {
    return condition === 'always' && ['rerank', 'answer'].includes(targetType);
  }
  return sourceType === 'rerank' && targetType === 'answer' && condition === 'always';
}

export function normalizeAiWorkflowDefinition(
  definition?: AiWorkflowDefinition | null,
  fallback: Partial<AiWorkflowFlags> = {},
): Required<Pick<AiWorkflowDefinition, 'nodes' | 'edges'>> & { version: 2 } {
  const usesNodeGraph = Array.isArray(definition?.nodes);
  const nodesByType = new Map<AiWorkflowStepType, AiWorkflowNodeDefinition>();
  if (usesNodeGraph) {
    definition?.nodes?.forEach((node) => {
      if (!node || !isStepType(node.type) || nodesByType.has(node.type)) return;
      nodesByType.set(node.type, {
        id: typeof node.id === 'string' && node.id.trim() ? node.id.trim() : nodeId(node.type),
        type: node.type,
        enabled: FIXED_NODE_TYPES.has(node.type) ? true : node.enabled !== false,
        position: normalizePosition(node.type, node.position),
      });
    });
  } else {
    definition?.steps?.forEach((step) => {
      if (!step || !isStepType(step.type) || nodesByType.has(step.type)) return;
      nodesByType.set(step.type, {
        id: nodeId(step.type),
        type: step.type,
        enabled: FIXED_NODE_TYPES.has(step.type) ? true : step.enabled !== false,
        position: normalizePosition(step.type),
      });
    });
  }
  const nodes = usesNodeGraph
    ? AI_WORKFLOW_STEP_ORDER.flatMap((type) => {
        const node = nodesByType.get(type);
        if (node) return [node];
        return FIXED_NODE_TYPES.has(type)
          ? [{ id: nodeId(type), type, enabled: true, position: normalizePosition(type) }]
          : [];
      })
    : defaultNodes(fallback).map((node) => nodesByType.get(node.type) ?? node);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sourceEdges = usesNodeGraph && Array.isArray(definition?.edges)
    ? definition.edges
    : defaultEdges(nodes);
  const seen = new Set<string>();
  const edges: AiWorkflowEdgeDefinition[] = [];
  sourceEdges.forEach((edge) => {
    const source = byId.get(edge?.source);
    const target = byId.get(edge?.target);
    if (!source || !target || !isCondition(edge?.condition)) return;
    if (!isSafeWorkflowEdge(source.type, target.type, edge.condition)) return;
    const key = `${source.id}:${target.id}:${edge.condition}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({
      id: typeof edge.id === 'string' && edge.id.trim() ? edge.id.trim() : `edge-${key}`,
      source: source.id,
      target: target.id,
      condition: edge.condition,
    });
  });
  return { version: 2, nodes, edges };
}

export function isAiWorkflowStepEnabled(
  definition: AiWorkflowDefinition,
  type: AiWorkflowStepType,
) {
  const node = normalizeAiWorkflowDefinition(definition).nodes.find((item) => item.type === type);
  return node ? node.enabled !== false : false;
}

function isReachable(
  definition: ReturnType<typeof normalizeAiWorkflowDefinition>,
  targetType: AiWorkflowStepType,
) {
  const start = definition.nodes.find((node) => node.type === 'preflight');
  const target = definition.nodes.find((node) => node.type === targetType);
  if (!start || !target || !target.enabled) return false;
  const byId = new Map(definition.nodes.map((node) => [node.id, node]));
  const edgesBySource = new Map<string, AiWorkflowEdgeDefinition[]>();
  definition.edges.forEach((edge) => {
    if (!PASS_THROUGH_CONDITIONS.has(edge.condition)) return;
    const rows = edgesBySource.get(edge.source) ?? [];
    rows.push(edge);
    edgesBySource.set(edge.source, rows);
  });
  const queue = [start.id];
  const visited = new Set<string>();
  while (queue.length) {
    const source = queue.shift()!;
    if (visited.has(source)) continue;
    visited.add(source);
    for (const edge of edgesBySource.get(source) ?? []) {
      const node = byId.get(edge.target);
      if (!node) continue;
      if (node.id === target.id && node.enabled) return true;
      queue.push(node.id);
    }
  }
  return false;
}

export function getAiWorkflowExecutionPlan(
  definition?: AiWorkflowDefinition | null,
  fallback: Partial<AiWorkflowFlags> = {},
): AiWorkflowExecutionPlan {
  const normalized = normalizeAiWorkflowDefinition(definition, fallback);
  const enableOriginalStandardQa = isReachable(normalized, 'standardQa');
  const enableColloquial = isReachable(normalized, 'colloquial');
  const enableCalibratedStandardQa = enableColloquial && isReachable(normalized, 'calibratedStandardQa');
  const enableBusinessCommands = isReachable(normalized, 'businessCommand');
  const enableKnowledgeRetrieval = isReachable(normalized, 'knowledgeRetrieval');
  const enableRerank = enableKnowledgeRetrieval && isReachable(normalized, 'rerank');
  return {
    enableOriginalStandardQa,
    enableCalibratedStandardQa,
    enableStandardQa: enableOriginalStandardQa || enableCalibratedStandardQa,
    enableColloquial,
    enableKnowledgeRetrieval,
    enableBusinessCommands,
    enableRerank,
  };
}

export function getAiWorkflowFlags(
  definition?: AiWorkflowDefinition | null,
  fallback: Partial<AiWorkflowFlags> = {},
): AiWorkflowFlags {
  const plan = getAiWorkflowExecutionPlan(definition, fallback);
  return {
    enableStandardQa: plan.enableStandardQa,
    enableColloquial: plan.enableColloquial,
    enableKnowledgeRetrieval: plan.enableKnowledgeRetrieval,
    enableBusinessCommands: plan.enableBusinessCommands,
    enableRerank: plan.enableRerank,
  };
}

export function getWorkflowValidationErrors(
  definition?: AiWorkflowDefinition | null,
  fallback: Partial<AiWorkflowFlags> = {},
) {
  const normalized = normalizeAiWorkflowDefinition(definition, fallback);
  return isReachable(normalized, 'answer') ? [] : ['请至少保留一条从“输入清洗与权限范围”到“回答生成与审计”的路径。'];
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
