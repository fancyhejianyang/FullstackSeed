import type {
  AiWorkflowDefinition,
  AiWorkflowEdgeCondition,
  AiWorkflowEdgeDefinition,
  AiWorkflowNodeDefinition,
  AiWorkflowNodePort,
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

const FIXED_NODE_TYPES = new Set<AiWorkflowStepType>(['preflight']);
const PASS_THROUGH_CONDITIONS = new Set<AiWorkflowEdgeCondition>([
  'always',
  'unmatched',
]);
const WORKFLOW_CANVAS_WIDTH = 650;
const WORKFLOW_NODE_WIDTH = 140;
const WORKFLOW_CANVAS_PADDING = 20;

export const AI_WORKFLOW_STEP_META: Record<
  AiWorkflowStepType,
  { title: string; description: string; kind: 'fixed' | 'decision' | 'action' | 'terminal' }
> = {
  preflight: {
    title: '原始输入',
    description: '确认会话、权限和可用范围；属于安全前置步骤，不能删除或关闭。',
    kind: 'fixed',
  },
  standardQa: {
    title: '匹配标准问答',
    description: '命中后可直接进入回答；未命中可继续口语校准、业务数据或知识库检索。',
    kind: 'decision',
  },
  colloquial: {
    title: '口语化校准',
    description: '使用人工维护词库改写问题，并附加语义约束。',
    kind: 'action',
  },
  calibratedStandardQa: {
    title: '校准后匹配问答',
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

function isNodePort(value: unknown): value is AiWorkflowNodePort {
  return value === 'left' || value === 'right' || value === 'top' || value === 'bottom';
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
  if (type === 'answer') return true;
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
  const graphNodes: AiWorkflowNodeDefinition[] = [];
  const graphNodeIds = new Set<string>();
  const fixedTypes = new Set<AiWorkflowStepType>();
  if (usesNodeGraph) {
    definition?.nodes?.forEach((node) => {
      if (!node || !isStepType(node.type)) return;
      const id = typeof node.id === 'string' && node.id.trim() ? node.id.trim() : nodeId(node.type);
      if (graphNodeIds.has(id) || (FIXED_NODE_TYPES.has(node.type) && fixedTypes.has(node.type))) return;
      graphNodeIds.add(id);
      if (FIXED_NODE_TYPES.has(node.type)) fixedTypes.add(node.type);
      graphNodes.push({
        id,
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
    ? [
        ...(fixedTypes.has('preflight')
          ? graphNodes.filter((node) => node.type === 'preflight')
          : [{ id: nodeId('preflight'), type: 'preflight' as const, enabled: true, position: normalizePosition('preflight') }]),
        ...graphNodes.filter((node) => node.type !== 'preflight'),
      ]
    : defaultNodes(fallback).map((node) => nodesByType.get(node.type) ?? node);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sourceEdges: AiWorkflowEdgeDefinition[] = usesNodeGraph && Array.isArray(definition?.edges)
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
      ...(isNodePort(edge.sourcePort) ? { sourcePort: edge.sourcePort } : {}),
      ...(isNodePort(edge.targetPort) ? { targetPort: edge.targetPort } : {}),
    });
  });
  return { version: 2, nodes, edges };
}

/** 新建工作流从唯一的安全入口开始，其余节点由管理员在画布中按需加入。 */
export function createInitialAiWorkflowDefinition(): Required<
  Pick<AiWorkflowDefinition, 'nodes' | 'edges'>
> & { version: 2 } {
  return {
    version: 2,
    nodes: [
      {
        id: nodeId('preflight'),
        type: 'preflight',
        enabled: true,
        position: normalizePosition('preflight'),
      },
    ],
    edges: [],
  };
}

/** 节点首次加入画布时使用的推荐位置；用户仍可随时拖动。 */
export function getAiWorkflowNodeDefaultPosition(
  type: AiWorkflowStepType,
  occurrence = 0,
) {
  const base = normalizePosition(type);
  const offset = Math.max(0, occurrence) * 28;
  return normalizePosition(type, { x: base.x + offset, y: base.y + offset });
}

export function isAiWorkflowStepEnabled(
  definition: AiWorkflowDefinition,
  type: AiWorkflowStepType,
) {
  return normalizeAiWorkflowDefinition(definition).nodes.some(
    (node) => node.type === type && node.enabled !== false,
  );
}

function isReachable(
  definition: ReturnType<typeof normalizeAiWorkflowDefinition>,
  targetType: AiWorkflowStepType,
) {
  const start = definition.nodes.find((node) => node.type === 'preflight');
  const targetIds = new Set(
    definition.nodes
      .filter((node) => node.type === targetType && node.enabled)
      .map((node) => node.id),
  );
  if (!start || !targetIds.size) return false;
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
      if (targetIds.has(node.id)) return true;
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
  return isReachable(normalized, 'answer') ? [] : ['请至少保留一条从“原始输入”到“回答生成与审计”的路径。'];
}

/**
 * 将画布中的节点和分支编译为可由回答模型阅读、也便于管理员继续补充的 Markdown 执行说明。
 * 图仍是运行时的结构化来源；此文本只描述处理目标、输入输出与各分支语义。
 */
export function generateAiWorkflowInstruction(
  definition?: AiWorkflowDefinition | null,
  fallback: Partial<AiWorkflowFlags> = {},
) {
  const normalized = normalizeAiWorkflowDefinition(definition, fallback);
  const nodesById = new Map(normalized.nodes.map((node) => [node.id, node]));
  const reachable = new Set<string>();
  const queue = normalized.nodes
    .filter((node) => node.type === 'preflight' && node.enabled)
    .map((node) => node.id);

  while (queue.length) {
    const nodeId = queue.shift()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    normalized.edges.forEach((edge) => {
      if (edge.source !== nodeId) return;
      const target = nodesById.get(edge.target);
      if (target?.enabled) queue.push(target.id);
    });
  }

  const sourceOrder = new Map(normalized.nodes.map((node, index) => [node.id, index]));
  const nodes = normalized.nodes
    .filter((node) => node.enabled && reachable.has(node.id))
    .sort((left, right) => {
      const typeDiff = AI_WORKFLOW_STEP_ORDER.indexOf(left.type) - AI_WORKFLOW_STEP_ORDER.indexOf(right.type);
      return typeDiff || (sourceOrder.get(left.id)! - sourceOrder.get(right.id)!);
    });
  const stepNumberById = new Map(nodes.map((node, index) => [node.id, index + 1]));
  const activeEdgesBySource = new Map<string, AiWorkflowEdgeDefinition[]>();
  normalized.edges.forEach((edge) => {
    if (!stepNumberById.has(edge.source) || !stepNumberById.has(edge.target)) return;
    const rows = activeEdgesBySource.get(edge.source) ?? [];
    rows.push(edge);
    activeEdgesBySource.set(edge.source, rows);
  });

  const baseLines = [
    '# AI 执行工作流',
    '',
    '## 目标',
    '分析用户提问，按已配置的节点和分支获取可靠依据，最后输出清晰、准确的答案并记录执行轨迹。',
    '',
    '## 全局约束',
    '- 原始提问记为 `userQuestion`；经过输入清洗后记为 `cleanQuestion`；发生口语化校准后记为 `normalizedQuestion`。',
    '- 后续步骤优先使用当前最新的问题表达：已校准时使用 `normalizedQuestion`，否则使用 `cleanQuestion`。',
    '- 标准问答命中时，按其固定答案返回，不得再以模型改写或虚构内容。',
    '- 检索、重排得到的是候选资料而非最终答案；回答只能依据命中的固定答案、获准业务数据或可信资料生成。',
    '- 每一步都记录输入、命中情况、所用数据源、分支去向和最终结果，供审计追溯。',
  ];

  if (!stepNumberById.has(nodes.find((node) => node.type === 'answer')?.id ?? '')) {
    baseLines.push('', '> 注意：当前画布尚未连通“回答生成与审计”节点，保存前请补全从“原始输入”到回答节点的路径。');
  }

  const lines = [...baseLines];
  nodes.forEach((node, index) => {
    const title = AI_WORKFLOW_STEP_META[node.type].title;
    const duplicateSuffix = nodes.filter((item) => item.type === node.type).length > 1
      ? `（分支 ${nodes.filter((item, itemIndex) => item.type === node.type && itemIndex <= index).length}）`
      : '';
    lines.push('', `## 步骤 ${index + 1}：${title}${duplicateSuffix}`);
    lines.push(...getAiWorkflowInstructionStepLines(node.type));

    const edges = activeEdgesBySource.get(node.id) ?? [];
    if (edges.length) {
      lines.push('分支与去向：');
      edges.forEach((edge) => {
        const target = nodesById.get(edge.target)!;
        lines.push(`- ${AI_WORKFLOW_CONDITION_META[edge.condition].label}：进入步骤 ${stepNumberById.get(target.id)}“${AI_WORKFLOW_STEP_META[target.type].title}”。`);
      });
    } else if (node.type !== 'answer') {
      lines.push('分支与去向：当前步骤未配置可达的后续连线。');
    }
  });

  return lines.join('\n');
}

function getAiWorkflowInstructionStepLines(type: AiWorkflowStepType) {
  const linesByType: Record<AiWorkflowStepType, string[]> = {
    preflight: [
      '输入：用户原始提问 `userQuestion`。',
      '动作：进行输入清洗、会话识别、权限校验和可用范围确认。',
      '输出：`cleanQuestion`、会话上下文和获准访问的数据范围。',
    ],
    standardQa: [
      '输入：当前问题表达。',
      '动作：调用 `qs.search` 精确搜索标准问答库。',
      '输出：命中的标准问答标识及固定答案；未命中时记录空结果。',
    ],
    colloquial: [
      '输入：当前问题表达。',
      '动作：匹配人工维护的口语化词库，将口语词替换为标准表达，并附加对应的语义约束。',
      '输出：`normalizedQuestion`、命中的口语词及其语义约束；未命中时沿用当前问题表达。',
    ],
    calibratedStandardQa: [
      '输入：`normalizedQuestion` 或未发生校准时的当前问题表达。',
      '动作：再次调用 `qs.search` 精确搜索标准问答库。',
      '输出：命中的标准问答标识及固定答案；未命中时记录空结果。',
    ],
    businessCommand: [
      '输入：当前问题表达、会话上下文和已授权的业务指令。',
      '动作：仅调用聊天应用已授权的只读业务接口，并按最新接口参数校验与读取数据。',
      '输出：可供回答引用的结构化业务数据、调用结果或无法查询的原因。',
    ],
    knowledgeRetrieval: [
      '输入：当前问题表达、用户权限和可用知识库范围。',
      '动作：匹配知识库路由规则，读取检索策略，并执行关键词/全文与向量混合检索、阈值筛选和资料汇总。',
      '输出：路由结果、候选资料片段、来源和相关性信息。',
    ],
    rerank: [
      '输入：当前问题表达和候选资料片段。',
      '动作：使用配置的 LLM 重排能力重新评估候选资料相关性，保留满足阈值的最佳资料。',
      '输出：按相关性排序的资料上下文；该结果只能作为回答依据，不能直接视为最终答案。',
    ],
    answer: [
      '输入：标准问答固定答案，或可信检索资料、已授权业务数据、口语语义约束及会话上下文。',
      '动作：仅依据已获准且可信的内容生成回答；资料不足时澄清问题、说明暂无依据或按规则转人工。',
      '输出：用户可见答案、可展示引用来源和完整审计日志。',
    ],
  };
  return linesByType[type];
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
