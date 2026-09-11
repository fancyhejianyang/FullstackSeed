<script setup lang="ts">
import { computed, onBeforeUnmount, ref, type ComponentPublicInstance } from 'vue';
import type {
  AiWorkflowDefinition,
  AiWorkflowEdgeCondition,
  AiWorkflowEdgeDefinition,
  AiWorkflowNodeDefinition,
  AiWorkflowNodePort,
  AiWorkflowStepType,
} from '@/api/knowledgeRetrievalConfig';
import {
  AI_WORKFLOW_CONDITION_META,
  AI_WORKFLOW_STEP_META,
  AI_WORKFLOW_STEP_ORDER,
  getAiWorkflowNodeDefaultPosition,
  getAiWorkflowExecutionPlan,
  getAiWorkflowFlags,
  getWorkflowValidationErrors,
  isSafeWorkflowEdge,
  normalizeAiWorkflowDefinition,
} from '@/utils/aiWorkflow';

const model = defineModel<AiWorkflowDefinition>({ required: true });

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const CANVAS_WIDTH = 650;
const CANVAS_HEIGHT = 960;
type SourcePort = Extract<AiWorkflowNodePort, 'right' | 'bottom'>;
type TargetPort = Extract<AiWorkflowNodePort, 'left' | 'top'>;
type NodeFrame = { x: number; y: number; width: number; height: number };

const selectedNodeId = ref<string | null>(null);
const connectionError = ref('');
const canvasRef = ref<HTMLElement>();
const nodeSizes = ref<Record<string, Pick<NodeFrame, 'width' | 'height'>>>({});
const observedNodeElements = new Map<string, HTMLElement>();
const nodeElementIds = new WeakMap<HTMLElement, string>();
let nodeResizeObserver: ResizeObserver | undefined;
const dragState = ref<{
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
} | null>(null);
const connectionDrag = ref<{
  sourceId: string;
  sourcePort: SourcePort;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} | null>(null);

const workflow = computed(() => normalizeAiWorkflowDefinition(model.value));
const workflowFlags = computed(() => getAiWorkflowFlags(workflow.value));
const workflowPlan = computed(() => getAiWorkflowExecutionPlan(workflow.value));
const validationErrors = computed(() => getWorkflowValidationErrors(workflow.value));
const selectedNode = computed(() =>
  selectedNodeId.value
    ? workflow.value.nodes.find((node) => node.id === selectedNodeId.value)
    : undefined,
);
const selectedMeta = computed(() =>
  selectedNode.value ? AI_WORKFLOW_STEP_META[selectedNode.value.type] : null,
);
const selectedLocked = computed(
  () => selectedNode.value?.type === 'preflight',
);
const availableNodeTypes = computed(() => {
  const existing = new Set(workflow.value.nodes.map((node) => node.type));
  return AI_WORKFLOW_STEP_ORDER.filter(
    (type) => !existing.has(type) && type !== 'preflight',
  );
});
function getAvailableConditions(
  source: AiWorkflowNodeDefinition | undefined,
  target: AiWorkflowNodeDefinition | undefined,
) {
  if (!source || !target) return [];
  return (Object.keys(AI_WORKFLOW_CONDITION_META) as AiWorkflowEdgeCondition[]).filter(
    (condition) => isSafeWorkflowEdge(source.type, target.type, condition),
  );
}

function getNodeFrame(node: AiWorkflowNodeDefinition): NodeFrame {
  const size = nodeSizes.value[node.id];
  return {
    x: node.position?.x ?? 20,
    y: node.position?.y ?? 20,
    width: size?.width ?? NODE_WIDTH,
    height: size?.height ?? NODE_HEIGHT,
  };
}

function getPortPoint(frame: NodeFrame, port: AiWorkflowNodePort) {
  if (port === 'left') return { x: frame.x, y: frame.y + frame.height / 2 };
  if (port === 'right') return { x: frame.x + frame.width, y: frame.y + frame.height / 2 };
  if (port === 'top') return { x: frame.x + frame.width / 2, y: frame.y };
  return { x: frame.x + frame.width / 2, y: frame.y + frame.height };
}

function getDefaultEdgePorts(source: NodeFrame, target: NodeFrame) {
  const sourceCenter = getPortPoint(source, 'bottom');
  const targetCenter = getPortPoint(target, 'top');
  const isVerticalDown =
    targetCenter.y > sourceCenter.y &&
    Math.abs(targetCenter.y - sourceCenter.y) >= Math.abs(targetCenter.x - sourceCenter.x);
  return isVerticalDown
    ? { sourcePort: 'bottom' as const, targetPort: 'top' as const }
    : { sourcePort: 'right' as const, targetPort: 'left' as const };
}

function getEdgePorts(
  edge: AiWorkflowEdgeDefinition,
  source: NodeFrame,
  target: NodeFrame,
) {
  const fallback = getDefaultEdgePorts(source, target);
  return {
    sourcePort: edge.sourcePort ?? fallback.sourcePort,
    targetPort: edge.targetPort ?? fallback.targetPort,
  };
}

const edgeLayouts = computed(() => {
  const nodes = new Map(workflow.value.nodes.map((node) => [node.id, node]));
  return workflow.value.edges.flatMap((edge) => {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) return [];
    const sourceFrame = getNodeFrame(source);
    const targetFrame = getNodeFrame(target);
    const ports = getEdgePorts(edge, sourceFrame, targetFrame);
    const start = getPortPoint(sourceFrame, ports.sourcePort);
    const end = getPortPoint(targetFrame, ports.targetPort);
    return [
      {
        ...edge,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        labelX: (start.x + end.x) / 2,
        labelY: (start.y + end.y) / 2 - 5,
      },
    ];
  });
});

function syncNodeSize(nodeId: string, element: HTMLElement) {
  const next = {
    width: element.offsetWidth || NODE_WIDTH,
    height: element.offsetHeight || NODE_HEIGHT,
  };
  const current = nodeSizes.value[nodeId];
  if (current?.width === next.width && current.height === next.height) return;
  nodeSizes.value = { ...nodeSizes.value, [nodeId]: next };
}

function getNodeResizeObserver() {
  if (!nodeResizeObserver) {
    nodeResizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const element = entry.target as HTMLElement;
        const nodeId = nodeElementIds.get(element);
        if (nodeId) syncNodeSize(nodeId, element);
      });
    });
  }
  return nodeResizeObserver;
}

function setNodeElement(
  nodeId: string,
  element: Element | ComponentPublicInstance | null,
) {
  const previous = observedNodeElements.get(nodeId);
  if (previous && previous !== element) getNodeResizeObserver().unobserve(previous);
  if (!(element instanceof HTMLElement)) {
    observedNodeElements.delete(nodeId);
    if (nodeSizes.value[nodeId]) {
      const { [nodeId]: _removed, ...rest } = nodeSizes.value;
      nodeSizes.value = rest;
    }
    return;
  }
  observedNodeElements.set(nodeId, element);
  nodeElementIds.set(element, nodeId);
  getNodeResizeObserver().observe(element);
  syncNodeSize(nodeId, element);
}

function updateWorkflow(mutator: (next: ReturnType<typeof normalizeAiWorkflowDefinition>) => void) {
  const next = normalizeAiWorkflowDefinition(model.value);
  mutator(next);
  model.value = next;
}

function selectNode(id: string) {
  selectedNodeId.value = id;
  connectionError.value = '';
}

function clearSelection() {
  selectedNodeId.value = null;
  connectionError.value = '';
}

function addNode(type: AiWorkflowStepType) {
  updateWorkflow((next) => {
    next.nodes.push({
      id: `node-${type}`,
      type,
      enabled: true,
      position: getAiWorkflowNodeDefaultPosition(type),
    });
  });
  selectNode(`node-${type}`);
}

function removeSelectedNode() {
  const node = selectedNode.value;
  if (!node || selectedLocked.value) return;
  updateWorkflow((next) => {
    next.nodes = next.nodes.filter((item) => item.id !== node.id);
    next.edges = next.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id);
  });
  clearSelection();
}

function setSelectedEnabled(enabled: boolean) {
  const node = selectedNode.value;
  if (!node || selectedLocked.value) return;
  updateWorkflow((next) => {
    const target = next.nodes.find((item) => item.id === node.id);
    if (target) target.enabled = enabled;
  });
}

function connectNodes(
  source: AiWorkflowNodeDefinition,
  target: AiWorkflowNodeDefinition,
  ports?: { sourcePort: SourcePort; targetPort: TargetPort },
) {
  const condition = getAvailableConditions(source, target)[0];
  if (!condition) {
    connectionError.value = '这两个节点不能直接连线，请选择符合处理顺序的目标节点。';
    return false;
  }
  const duplicate = workflow.value.edges.some(
    (edge) =>
      edge.source === source.id && edge.target === target.id && edge.condition === condition,
  );
  if (duplicate) {
    connectionError.value = '该连线已经存在。';
    return false;
  }
  updateWorkflow((next) => {
    next.edges.push({
      id: `edge-${source.id}-${target.id}-${condition}`,
      source: source.id,
      target: target.id,
      condition,
      ...ports,
    });
  });
  connectionError.value = '';
  return true;
}

function removeEdge(id: string) {
  updateWorkflow((next) => {
    next.edges = next.edges.filter((edge) => edge.id !== id);
  });
}

function updateEdgeCondition(id: string, condition: string) {
  const nextCondition = condition as AiWorkflowEdgeCondition;
  updateWorkflow((next) => {
    const edge = next.edges.find((item) => item.id === id);
    const source = next.nodes.find((node) => node.id === edge?.source);
    const target = next.nodes.find((node) => node.id === edge?.target);
    if (!edge || !source || !target || !isSafeWorkflowEdge(source.type, target.type, nextCondition)) {
      connectionError.value = '该连线不支持所选的分支条件。';
      return;
    }
    const duplicate = next.edges.some(
      (item) =>
        item.id !== edge.id &&
        item.source === source.id &&
        item.target === target.id &&
        item.condition === nextCondition,
    );
    if (duplicate) {
      connectionError.value = '该目标节点已存在相同分支条件的连线。';
      return;
    }
    edge.condition = nextCondition;
    edge.id = `edge-${source.id}-${target.id}-${nextCondition}`;
    connectionError.value = '';
  });
}

function getEdgeConditions(edge: { source: string; target: string }) {
  return getAvailableConditions(
    workflow.value.nodes.find((node) => node.id === edge.source),
    workflow.value.nodes.find((node) => node.id === edge.target),
  );
}

function getNodeClass(node: AiWorkflowNodeDefinition) {
  return {
    'is-active': node.id === selectedNodeId.value,
    'is-disabled': !node.enabled,
    [`is-${AI_WORKFLOW_STEP_META[node.type].kind}`]: true,
  };
}

function edgeColor(condition: AiWorkflowEdgeCondition) {
  if (condition === 'matched') return '#67c23a';
  if (condition === 'unmatched') return '#909399';
  return '#409eff';
}

function startDrag(event: PointerEvent, node: AiWorkflowNodeDefinition) {
  if (event.button !== 0 || !node.position) return;
  selectNode(node.id);
  dragState.value = {
    id: node.id,
    startX: event.clientX,
    startY: event.clientY,
    originX: node.position.x,
    originY: node.position.y,
  };
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', stopDrag, { once: true });
}

function handlePointerMove(event: PointerEvent) {
  const state = dragState.value;
  if (!state) return;
  updateWorkflow((next) => {
    const node = next.nodes.find((item) => item.id === state.id);
    if (!node) return;
    const frame = getNodeFrame(node);
    node.position = {
      x: Math.min(CANVAS_WIDTH - frame.width - 20, Math.max(20, state.originX + event.clientX - state.startX)),
      y: Math.min(CANVAS_HEIGHT - frame.height - 20, Math.max(20, state.originY + event.clientY - state.startY)),
    };
  });
}

function stopDrag() {
  dragState.value = null;
  window.removeEventListener('pointermove', handlePointerMove);
}

function getCanvasPoint(event: PointerEvent) {
  const bounds = canvasRef.value?.getBoundingClientRect();
  if (!bounds) return null;
  return {
    x: Math.min(CANVAS_WIDTH, Math.max(0, event.clientX - bounds.left)),
    y: Math.min(CANVAS_HEIGHT, Math.max(0, event.clientY - bounds.top)),
  };
}

function startConnection(
  event: PointerEvent,
  node: AiWorkflowNodeDefinition,
  sourcePort: SourcePort,
) {
  if (event.button !== 0 || !node.position || node.type === 'answer') return;
  event.preventDefault();
  selectNode(node.id);
  const point = getPortPoint(getNodeFrame(node), sourcePort);
  connectionDrag.value = {
    sourceId: node.id,
    sourcePort,
    x1: point.x,
    y1: point.y,
    x2: point.x,
    y2: point.y,
  };
  window.addEventListener('pointermove', handleConnectionMove);
  window.addEventListener('pointerup', stopConnection, { once: true });
}

function handleConnectionMove(event: PointerEvent) {
  const point = getCanvasPoint(event);
  if (!connectionDrag.value || !point) return;
  connectionDrag.value = { ...connectionDrag.value, x2: point.x, y2: point.y };
}

function stopConnection() {
  connectionDrag.value = null;
  window.removeEventListener('pointermove', handleConnectionMove);
  window.removeEventListener('pointerup', stopConnection);
}

function finishConnection(event: PointerEvent, target: AiWorkflowNodeDefinition) {
  const drag = connectionDrag.value;
  if (!drag || drag.sourceId === target.id) return;
  const source = workflow.value.nodes.find((node) => node.id === drag.sourceId);
  if (source) {
    connectNodes(source, target, {
      sourcePort: drag.sourcePort,
      targetPort: drag.sourcePort === 'bottom' ? 'top' : 'left',
    });
  }
  stopConnection();
  event.stopPropagation();
}

onBeforeUnmount(() => {
  stopDrag();
  stopConnection();
  nodeResizeObserver?.disconnect();
});
</script>

<template>
  <div class="ai-workflow-editor">
    <div class="ai-workflow-editor__intro">
      新建流程仅保留输入清洗入口。按需从节点库加入节点，并从节点右侧或底部蓝点拖到目标节点建立流向；服务端会校验循环、入口和回答出口。
    </div>

    <div v-if="availableNodeTypes.length" class="ai-workflow-editor__palette">
      <span class="ai-workflow-editor__palette-label">节点库</span>
      <el-button
        v-for="type in availableNodeTypes"
        :key="type"
        size="small"
        plain
        @click="addNode(type)"
      >
        + {{ AI_WORKFLOW_STEP_META[type].title }}
      </el-button>
    </div>

    <div class="ai-workflow-editor__layout">
      <div class="ai-workflow-editor__canvas-viewport">
        <div
          ref="canvasRef"
          class="ai-workflow-editor__canvas"
          :style="{ width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px` }"
          @click.self="clearSelection"
        >
          <svg class="ai-workflow-editor__edges" :viewBox="`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`" aria-label="工作流连线">
            <defs>
              <marker id="workflow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#a0cfff" />
              </marker>
            </defs>
            <g v-for="edge in edgeLayouts" :key="edge.id">
              <line
                :x1="edge.x1"
                :y1="edge.y1"
                :x2="edge.x2"
                :y2="edge.y2"
                :stroke="edgeColor(edge.condition)"
                stroke-width="2"
                marker-end="url(#workflow-arrow)"
              />
              <text :x="edge.labelX" :y="edge.labelY" :fill="edgeColor(edge.condition)" text-anchor="middle">
                {{ AI_WORKFLOW_CONDITION_META[edge.condition].label }}
              </text>
            </g>
            <line
              v-if="connectionDrag"
              :x1="connectionDrag.x1"
              :y1="connectionDrag.y1"
              :x2="connectionDrag.x2"
              :y2="connectionDrag.y2"
              class="ai-workflow-editor__edge-preview"
              marker-end="url(#workflow-arrow)"
            />
          </svg>

          <button
            v-for="node in workflow.nodes"
            :key="node.id"
            :ref="(element) => setNodeElement(node.id, element)"
            class="workflow-node"
            :class="getNodeClass(node)"
            :style="{ left: `${node.position?.x ?? 20}px`, top: `${node.position?.y ?? 20}px` }"
            type="button"
            @click="selectNode(node.id)"
            @pointerdown="startDrag($event, node)"
            @pointerup="finishConnection($event, node)"
          >
            <span class="workflow-node__drag">⋮⋮ 拖拽</span>
            <span class="workflow-node__title">{{ AI_WORKFLOW_STEP_META[node.type].title }}</span>
            <span class="workflow-node__state">{{ node.enabled ? '启用' : '跳过' }}</span>
            <span
              v-if="node.type !== 'preflight'"
              class="workflow-node__connector workflow-node__connector--input workflow-node__connector--top"
              aria-hidden="true"
            />
            <span
              v-if="node.type !== 'preflight'"
              class="workflow-node__connector workflow-node__connector--input workflow-node__connector--left"
              aria-hidden="true"
            />
            <span
              v-if="node.type !== 'answer'"
              class="workflow-node__connector workflow-node__connector--output workflow-node__connector--right"
              title="从右侧拖到目标节点以建立连线"
              @pointerdown.stop="startConnection($event, node, 'right')"
            />
            <span
              v-if="node.type !== 'answer'"
              class="workflow-node__connector workflow-node__connector--output workflow-node__connector--bottom"
              title="从底部拖到目标节点以建立向下连线"
              @pointerdown.stop="startConnection($event, node, 'bottom')"
            />
          </button>
        </div>
      </div>

      <div class="ai-workflow-editor__panel">
        <template v-if="selectedNode && selectedMeta">
          <div class="ai-workflow-editor__panel-title">{{ selectedMeta.title }}</div>
          <div class="ai-workflow-editor__panel-description">{{ selectedMeta.description }}</div>
          <el-switch
            v-if="!selectedLocked"
            :model-value="selectedNode.enabled"
            active-text="启用节点"
            inactive-text="跳过节点"
            @update:model-value="setSelectedEnabled"
          />
          <div v-else class="ai-workflow-editor__locked">此节点是系统固定的安全边界，不能删除或关闭。</div>
          <el-button
            v-if="!selectedLocked"
            class="ai-workflow-editor__delete-node"
            size="small"
            type="danger"
            plain
            @click="removeSelectedNode"
          >
            从画布移除节点
          </el-button>

          <div class="ai-workflow-editor__connection-title">拖拽建立连线</div>
          <div class="ai-workflow-editor__condition-tip">
            从右侧蓝点拖出横向连线，或从底部蓝点拖到下方节点建立纵向连线。标准问答节点默认创建“未命中”分支，可在下方修改为“命中”。
          </div>
          <div v-if="connectionError" class="ai-workflow-editor__error">{{ connectionError }}</div>
          <div class="ai-workflow-editor__connection-title">当前连线</div>
          <div class="ai-workflow-editor__edge-list">
            <div v-for="edge in workflow.edges" :key="edge.id" class="ai-workflow-editor__edge-row">
              <span>{{ AI_WORKFLOW_STEP_META[workflow.nodes.find((node) => node.id === edge.source)?.type ?? 'preflight'].title }}</span>
              <el-select
                :model-value="edge.condition"
                size="small"
                class="ai-workflow-editor__edge-condition"
                @update:model-value="updateEdgeCondition(edge.id, $event)"
              >
                <el-option
                  v-for="condition in getEdgeConditions(edge)"
                  :key="condition"
                  :label="AI_WORKFLOW_CONDITION_META[condition].label"
                  :value="condition"
                />
              </el-select>
              <span>{{ AI_WORKFLOW_STEP_META[workflow.nodes.find((node) => node.id === edge.target)?.type ?? 'answer'].title }}</span>
              <el-button size="small" link type="danger" @click="removeEdge(edge.id)">移除</el-button>
            </div>
            <div v-if="!workflow.edges.length" class="ai-workflow-editor__muted">暂无连线，请先建立可达路径。</div>
          </div>

          <div class="ai-workflow-editor__summary">
            <div>原问题标准问答：{{ workflowPlan.enableOriginalStandardQa ? '可达' : '不可达' }}</div>
            <div>口语校准：{{ workflowPlan.enableColloquial ? '可达' : '不可达' }}</div>
            <div>校准后标准问答：{{ workflowPlan.enableCalibratedStandardQa ? '可达' : '不可达' }}</div>
            <div>知识库检索：{{ workflowFlags.enableKnowledgeRetrieval ? '可达' : '不可达' }}</div>
            <div>业务数据指令：{{ workflowFlags.enableBusinessCommands ? '可达' : '不可达' }}</div>
            <div>LLM 重排：{{ workflowFlags.enableRerank ? '可达' : '不可达' }}</div>
          </div>
          <div v-for="error in validationErrors" :key="error" class="ai-workflow-editor__error">{{ error }}</div>
        </template>

        <div v-else class="ai-workflow-editor__empty-panel">
          点击画布中的节点后，可查看说明、编辑连线或从画布移除可选节点。
          <br />
          新建时请先从节点库加入回答生成节点，并把它与输入清洗入口连接起来。
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-workflow-editor { width: 100%; }
.ai-workflow-editor__intro, .ai-workflow-editor__panel-description, .ai-workflow-editor__locked, .ai-workflow-editor__condition-tip, .ai-workflow-editor__muted {
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}
.ai-workflow-editor__palette { display: flex; width: 984px; max-width: 100%; flex-wrap: nowrap; align-items: center; gap: 8px; margin: 12px auto 0; overflow-x: auto; padding-bottom: 2px; }
.ai-workflow-editor__palette :deep(.el-button) { flex: 0 0 auto; }
.ai-workflow-editor__palette-label, .ai-workflow-editor__connection-title { color: #303133; font-size: 13px; font-weight: 600; }
.ai-workflow-editor__layout { display: grid; grid-template-columns: 650px minmax(270px, 320px); justify-content: center; gap: 14px; margin-top: 12px; }
.ai-workflow-editor__canvas-viewport { width: 650px; max-width: 100%; max-height: 760px; overflow: auto; border: 1px solid #d9ecff; border-radius: 8px; background: #f8fbff; }
.ai-workflow-editor__canvas { position: relative; min-width: 650px; margin: 0 auto; background-image: radial-gradient(#d9ecff 1px, transparent 1px); background-size: 16px 16px; }
.ai-workflow-editor__edges { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.ai-workflow-editor__edges text { font-size: 11px; font-weight: 600; paint-order: stroke; stroke: #f8fbff; stroke-width: 4px; }
.ai-workflow-editor__edge-preview { stroke: #409eff; stroke-width: 2; stroke-dasharray: 5 4; }
.workflow-node { position: absolute; display: flex; width: 160px; min-height: 60px; flex-direction: column; justify-content: center; padding: 6px 8px; border: 1px solid #a0cfff; border-radius: 7px; background: #fff; color: #303133; cursor: grab; font: inherit; text-align: center; transition: border-color .2s, box-shadow .2s, opacity .2s; user-select: none; }
.workflow-node:active { cursor: grabbing; }
.workflow-node:hover, .workflow-node.is-active { border-color: #409eff; box-shadow: 0 0 0 2px rgba(64, 158, 255, .16); }
.workflow-node.is-disabled { opacity: .48; }
.workflow-node.is-decision { border-color: #e6a23c; border-radius: 22px; }
.workflow-node.is-terminal { border-color: #67c23a; }
.workflow-node__drag { margin-bottom: 3px; color: #909399; font-size: 10px; }
.workflow-node__title { font-size: 13px; font-weight: 600; }
.workflow-node__state { margin-top: 3px; color: #909399; font-size: 11px; }
.workflow-node__connector { position: absolute; box-sizing: border-box; width: 12px; height: 12px; border: 2px solid #409eff; border-radius: 50%; }
.workflow-node__connector--input { background: #fff; pointer-events: none; }
.workflow-node__connector--left { top: 50%; left: -6px; transform: translateY(-50%); }
.workflow-node__connector--top { top: -6px; left: 50%; transform: translateX(-50%); }
.workflow-node__connector--output { border-color: #fff; background: #409eff; box-shadow: 0 0 0 1px #409eff; cursor: crosshair; }
.workflow-node__connector--right { top: 50%; right: -6px; transform: translateY(-50%); }
.workflow-node__connector--bottom { bottom: -6px; left: 50%; transform: translateX(-50%); }
.workflow-node__connector--output:hover { background: #79bbff; box-shadow: 0 0 0 3px rgba(64, 158, 255, .18); }
.ai-workflow-editor__panel { min-width: 0; padding: 14px; border: 1px solid #ebeef5; border-radius: 8px; background: #fff; }
.ai-workflow-editor__empty-panel { display: flex; min-height: 140px; align-items: center; color: #909399; font-size: 13px; line-height: 1.7; }
.ai-workflow-editor__panel-title { margin-bottom: 8px; color: #303133; font-size: 14px; font-weight: 600; }
.ai-workflow-editor__panel :deep(.el-switch) { margin-top: 14px; }
.ai-workflow-editor__delete-node { display: block; margin-top: 12px; }
.ai-workflow-editor__connection-title { margin-top: 18px; padding-top: 12px; border-top: 1px solid #ebeef5; }
.ai-workflow-editor__condition-tip { margin-top: 6px; }
.ai-workflow-editor__edge-list { display: grid; gap: 7px; margin-top: 10px; }
.ai-workflow-editor__edge-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto; align-items: center; gap: 5px; color: #606266; font-size: 12px; }
.ai-workflow-editor__edge-row > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-workflow-editor__edge-condition { width: 82px; }
.ai-workflow-editor__summary { margin-top: 16px; padding-top: 12px; border-top: 1px solid #ebeef5; color: #606266; font-size: 12px; line-height: 1.9; }
.ai-workflow-editor__error { margin-top: 8px; color: #f56c6c; font-size: 12px; line-height: 1.5; }
@media (max-width: 860px) { .ai-workflow-editor__layout { grid-template-columns: 1fr; } }
</style>
