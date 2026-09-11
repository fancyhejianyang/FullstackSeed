export type AiWorkflowStepType =
  | 'preflight'
  | 'standardQa'
  | 'colloquial'
  | 'calibratedStandardQa'
  | 'businessCommand'
  | 'knowledgeRetrieval'
  | 'rerank'
  | 'answer';

export type AiWorkflowEdgeCondition = 'always' | 'matched' | 'unmatched';
export type AiWorkflowNodePort = 'left' | 'right' | 'top' | 'bottom';

export interface AiWorkflowStepDefinition {
  id: AiWorkflowStepType;
  type: AiWorkflowStepType;
  enabled: boolean;
}

export interface AiWorkflowNodePosition {
  x: number;
  y: number;
}

export interface AiWorkflowNodeDefinition {
  id: string;
  type: AiWorkflowStepType;
  enabled: boolean;
  position?: AiWorkflowNodePosition;
}

export interface AiWorkflowEdgeDefinition {
  id: string;
  source: string;
  target: string;
  condition: AiWorkflowEdgeCondition;
  /** 仅用于画布展示与编辑，不参与后端执行分支。 */
  sourcePort?: AiWorkflowNodePort;
  targetPort?: AiWorkflowNodePort;
}

/**
 * version 1 仅保存步骤开关；version 2 保存可编辑的安全节点与连线。
 * 读取时统一转为 version 2，保证历史配置不需要重置。
 */
export interface AiWorkflowDefinition {
  version: 1 | 2;
  steps?: AiWorkflowStepDefinition[];
  nodes?: AiWorkflowNodeDefinition[];
  edges?: AiWorkflowEdgeDefinition[];
}

export interface NormalizedAiWorkflowDefinition extends AiWorkflowDefinition {
  version: 2;
  nodes: AiWorkflowNodeDefinition[];
  edges: AiWorkflowEdgeDefinition[];
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

export interface AiWorkflowExecutionPlan extends AiWorkflowDerivedFlags {
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

const DEFAULT_NODE_POSITIONS: Record<
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

function isWorkflowStepType(value: unknown): value is AiWorkflowStepType {
  return (
    typeof value === 'string' &&
    AI_WORKFLOW_STEP_ORDER.includes(value as AiWorkflowStepType)
  );
}

function isEdgeCondition(value: unknown): value is AiWorkflowEdgeCondition {
  return value === 'always' || value === 'matched' || value === 'unmatched';
}

function isWorkflowNodePort(value: unknown): value is AiWorkflowNodePort {
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
  const x = Number(position?.x);
  const y = Number(position?.y);
  return {
    x: Number.isFinite(x)
      ? Math.min(1160, Math.max(20, Math.round(x)))
      : fallback.x,
    y: Number.isFinite(y)
      ? Math.min(920, Math.max(20, Math.round(y)))
      : fallback.y,
  };
}

function getLegacyEnabled(
  type: AiWorkflowStepType,
  flags: AiWorkflowLegacyFlags,
) {
  if (FIXED_NODE_TYPES.has(type)) return true;
  if (type === 'answer') return true;
  if (type === 'standardQa' || type === 'calibratedStandardQa') {
    return flags.enableStandardQa !== false;
  }
  if (type === 'colloquial') return flags.enableColloquial !== false;
  if (type === 'businessCommand') return Boolean(flags.enableBusinessCommands);
  if (type === 'knowledgeRetrieval')
    return flags.enableKnowledgeRetrieval !== false;
  return (
    flags.enableKnowledgeRetrieval !== false && flags.enableRerank !== false
  );
}

function createDefaultNodes(flags: AiWorkflowLegacyFlags) {
  return AI_WORKFLOW_STEP_ORDER.map((type) => ({
    id: nodeId(type),
    type,
    enabled: getLegacyEnabled(type, flags),
    position: normalizePosition(type),
  }));
}

function createDefaultEdges(nodes: AiWorkflowNodeDefinition[]) {
  const byType = new Map(nodes.map((node) => [node.type, node]));
  const rows: Array<
    [AiWorkflowStepType, AiWorkflowStepType, AiWorkflowEdgeCondition]
  > = [
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
      ? [
          {
            id: `edge-${source.id}-${target.id}-${condition}`,
            source: source.id,
            target: target.id,
            condition,
          },
        ]
      : [];
  });
}

/** 可编辑连线的白名单，防止跳过权限前置或把模型调用接入危险路径。 */
export function isSafeWorkflowEdge(
  sourceType: AiWorkflowStepType,
  targetType: AiWorkflowStepType,
  condition: AiWorkflowEdgeCondition,
) {
  if (sourceType === targetType) return false;
  if (sourceType === 'preflight') {
    return (
      condition === 'always' &&
      [
        'standardQa',
        'colloquial',
        'businessCommand',
        'knowledgeRetrieval',
        'answer',
      ].includes(targetType)
    );
  }
  if (sourceType === 'standardQa' || sourceType === 'calibratedStandardQa') {
    if (targetType === 'answer') {
      return condition === 'matched' || condition === 'unmatched';
    }
    const allowedTargets =
      sourceType === 'standardQa'
        ? ['colloquial', 'businessCommand', 'knowledgeRetrieval']
        : ['businessCommand', 'knowledgeRetrieval'];
    return condition === 'unmatched' && allowedTargets.includes(targetType);
  }
  if (sourceType === 'colloquial') {
    return (
      condition === 'always' &&
      [
        'calibratedStandardQa',
        'businessCommand',
        'knowledgeRetrieval',
        'answer',
      ].includes(targetType)
    );
  }
  if (sourceType === 'businessCommand') {
    return (
      condition === 'always' &&
      ['knowledgeRetrieval', 'answer'].includes(targetType)
    );
  }
  if (sourceType === 'knowledgeRetrieval') {
    return condition === 'always' && ['rerank', 'answer'].includes(targetType);
  }
  return (
    sourceType === 'rerank' && targetType === 'answer' && condition === 'always'
  );
}

/**
 * 将历史开关式流程和 v2 图编排统一成可安全执行的节点图。
 * v2 不会自动补回被管理员删除的节点；只强制保留输入清洗前置节点。
 */
export function normalizeAiWorkflowDefinition(
  definition?: AiWorkflowDefinition | null,
  flags: AiWorkflowLegacyFlags = {},
): NormalizedAiWorkflowDefinition {
  const usesNodeGraph = Array.isArray(definition?.nodes);
  const nodesByType = new Map<AiWorkflowStepType, AiWorkflowNodeDefinition>();

  if (usesNodeGraph) {
    definition?.nodes?.forEach((node) => {
      if (!node || !isWorkflowStepType(node.type) || nodesByType.has(node.type))
        return;
      nodesByType.set(node.type, {
        id:
          typeof node.id === 'string' && node.id.trim()
            ? node.id.trim()
            : nodeId(node.type),
        type: node.type,
        enabled: FIXED_NODE_TYPES.has(node.type)
          ? true
          : node.enabled !== false,
        position: normalizePosition(node.type, node.position),
      });
    });
  } else {
    definition?.steps?.forEach((step) => {
      if (!step || !isWorkflowStepType(step.type) || nodesByType.has(step.type))
        return;
      nodesByType.set(step.type, {
        id: nodeId(step.type),
        type: step.type,
        enabled: FIXED_NODE_TYPES.has(step.type)
          ? true
          : step.enabled !== false,
        position: normalizePosition(step.type),
      });
    });
  }

  const nodes = usesNodeGraph
    ? AI_WORKFLOW_STEP_ORDER.flatMap((type) => {
        const node = nodesByType.get(type);
        if (node) return [node];
        return FIXED_NODE_TYPES.has(type)
          ? [
              {
                id: nodeId(type),
                type,
                enabled: true,
                position: normalizePosition(type),
              },
            ]
          : [];
      })
    : createDefaultNodes(flags).map(
        (node) => nodesByType.get(node.type) ?? node,
      );

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sourceEdges: AiWorkflowEdgeDefinition[] =
    usesNodeGraph && Array.isArray(definition?.edges)
      ? definition.edges
      : createDefaultEdges(nodes);
  const uniqueEdges = new Set<string>();
  const edges: AiWorkflowEdgeDefinition[] = [];
  sourceEdges.forEach((edge) => {
    const source = nodeById.get(edge?.source);
    const target = nodeById.get(edge?.target);
    if (!source || !target || !isEdgeCondition(edge?.condition)) return;
    if (!isSafeWorkflowEdge(source.type, target.type, edge.condition)) return;
    const key = `${source.id}:${target.id}:${edge.condition}`;
    if (uniqueEdges.has(key)) return;
    uniqueEdges.add(key);
    edges.push({
      id:
        typeof edge.id === 'string' && edge.id.trim()
          ? edge.id.trim()
          : `edge-${key}`,
      source: source.id,
      target: target.id,
      condition: edge.condition,
      ...(isWorkflowNodePort(edge.sourcePort)
        ? { sourcePort: edge.sourcePort }
        : {}),
      ...(isWorkflowNodePort(edge.targetPort)
        ? { targetPort: edge.targetPort }
        : {}),
    });
  });

  return { version: 2, nodes, edges };
}

function findNodeByType(
  definition: NormalizedAiWorkflowDefinition,
  type: AiWorkflowStepType,
) {
  return definition.nodes.find((node) => node.type === type);
}

function isReachableOnPassThroughPath(
  definition: NormalizedAiWorkflowDefinition,
  targetType: AiWorkflowStepType,
) {
  const start = findNodeByType(definition, 'preflight');
  const target = findNodeByType(definition, targetType);
  if (!start || !target || !target.enabled) return false;
  const nodeById = new Map(definition.nodes.map((node) => [node.id, node]));
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
      const node = nodeById.get(edge.target);
      if (!node) continue;
      if (node.id === target.id && node.enabled) return true;
      // 被关闭节点作为透明节点继续向后走，保持删除/关闭节点后的安全旁路。
      queue.push(node.id);
    }
  }
  return false;
}

export function getAiWorkflowExecutionPlan(
  definition?: AiWorkflowDefinition | null,
  fallback: AiWorkflowLegacyFlags = {},
): AiWorkflowExecutionPlan {
  const normalized = normalizeAiWorkflowDefinition(definition, fallback);
  const enableOriginalStandardQa = isReachableOnPassThroughPath(
    normalized,
    'standardQa',
  );
  const enableColloquial = isReachableOnPassThroughPath(
    normalized,
    'colloquial',
  );
  const enableCalibratedStandardQa =
    enableColloquial &&
    isReachableOnPassThroughPath(normalized, 'calibratedStandardQa');
  const enableBusinessCommands = isReachableOnPassThroughPath(
    normalized,
    'businessCommand',
  );
  const enableKnowledgeRetrieval = isReachableOnPassThroughPath(
    normalized,
    'knowledgeRetrieval',
  );
  const enableRerank =
    enableKnowledgeRetrieval &&
    isReachableOnPassThroughPath(normalized, 'rerank');
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

export function getAiWorkflowDerivedFlags(
  definition?: AiWorkflowDefinition | null,
  fallback: AiWorkflowLegacyFlags = {},
): AiWorkflowDerivedFlags {
  const plan = getAiWorkflowExecutionPlan(definition, fallback);
  return {
    enableStandardQa: plan.enableStandardQa,
    enableColloquial: plan.enableColloquial,
    enableKnowledgeRetrieval: plan.enableKnowledgeRetrieval,
    enableBusinessCommands: plan.enableBusinessCommands,
    enableRerank: plan.enableRerank,
  };
}

export function isAiWorkflowStepEnabled(
  definition: AiWorkflowDefinition | null | undefined,
  type: AiWorkflowStepType,
  fallback: boolean,
) {
  const normalized = normalizeAiWorkflowDefinition(definition);
  const node = findNodeByType(normalized, type);
  return node ? node.enabled !== false : fallback;
}

function hasCycle(definition: NormalizedAiWorkflowDefinition) {
  const edgesBySource = new Map<string, string[]>();
  definition.edges.forEach((edge) => {
    const rows = edgesBySource.get(edge.source) ?? [];
    rows.push(edge.target);
    edgesBySource.set(edge.source, rows);
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeIdValue: string): boolean => {
    if (visiting.has(nodeIdValue)) return true;
    if (visited.has(nodeIdValue)) return false;
    visiting.add(nodeIdValue);
    const cycle = (edgesBySource.get(nodeIdValue) ?? []).some(visit);
    visiting.delete(nodeIdValue);
    visited.add(nodeIdValue);
    return cycle;
  };
  return definition.nodes.some((node) => visit(node.id));
}

/** 保存时使用：既确保图可运行，也确保不出现未受控的连线。 */
export function validateAiWorkflowDefinition(
  definition: NormalizedAiWorkflowDefinition,
) {
  const errors: string[] = [];
  const preflight = findNodeByType(definition, 'preflight');
  const answer = findNodeByType(definition, 'answer');
  if (!preflight || !answer)
    errors.push('工作流必须包含输入清洗与回答生成节点');
  if (hasCycle(definition)) errors.push('工作流不能包含循环连线');
  if (!isReachableOnPassThroughPath(definition, 'answer')) {
    errors.push('工作流必须存在从输入清洗到回答生成的可达路径');
  }
  return errors;
}
