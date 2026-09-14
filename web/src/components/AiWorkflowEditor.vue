<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type ComponentPublicInstance } from 'vue';
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
  isSafeWorkflowEdge,
  normalizeAiWorkflowDefinition,
} from '@/utils/aiWorkflow';

const model = defineModel<AiWorkflowDefinition>({ required: true });

const NODE_WIDTH = 140;
const NODE_HEIGHT = 48;
const NODE_GAP = 32;
const CANVAS_PADDING = 20;
const CANVAS_MIN_WIDTH = 650;
const CANVAS_HEIGHT = 960;
const CANVAS_VIEWPORT_HEIGHT = 500;
const MIN_CANVAS_ZOOM = 0.4;
const MAX_CANVAS_ZOOM = 1.6;
type SourcePort = Extract<AiWorkflowNodePort, 'right' | 'bottom'>;
type TargetPort = Extract<AiWorkflowNodePort, 'left' | 'top'>;
type NodeFrame = { x: number; y: number; width: number; height: number };

const selectedNodeId = ref<string | null>(null);
const canvasRef = ref<HTMLElement>();
const canvasViewportRef = ref<HTMLElement>();
const canvasZoom = ref(1);
const canvasPan = ref({ x: 0, y: 0 });
const canvasWidth = ref(CANVAS_MIN_WIDTH);
const nodeSizes = ref<Record<string, Pick<NodeFrame, 'width' | 'height'>>>({});
const observedNodeElements = new Map<string, HTMLElement>();
const nodeElementIds = new WeakMap<HTMLElement, string>();
let nodeResizeObserver: ResizeObserver | undefined;
let canvasViewportResizeObserver: ResizeObserver | undefined;
const dragState = ref<{
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
} | null>(null);
const canvasPanState = ref<{
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
const canvasStyle = computed(() => ({
  width: `${canvasWidth.value}px`,
  height: `${CANVAS_HEIGHT}px`,
  transform: `translate3d(${canvasPan.value.x}px, ${canvasPan.value.y}px, 0) scale(${canvasZoom.value})`,
  transformOrigin: 'top left',
}));
const canvasZoomLabel = computed(() => `${Math.round(canvasZoom.value * 100)}%`);
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
const availableNodeTypes = computed(() =>
  AI_WORKFLOW_STEP_ORDER.filter((type) => type !== 'preflight'),
);
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
}

function clearSelection() {
  selectedNodeId.value = null;
}

function hasAddedNode(type: AiWorkflowStepType) {
  return workflow.value.nodes.some((node) => node.type === type);
}

function getNextNodeId(
  type: AiWorkflowStepType,
  nodes: AiWorkflowNodeDefinition[],
) {
  const prefix = `node-${type}`;
  const ids = new Set(nodes.map((node) => node.id));
  if (!ids.has(prefix)) return prefix;
  let index = 2;
  while (ids.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function clampNodePosition(position: { x: number; y: number }) {
  return {
    x: Math.min(
      canvasWidth.value - NODE_WIDTH - CANVAS_PADDING,
      Math.max(CANVAS_PADDING, position.x),
    ),
    y: Math.min(
      CANVAS_HEIGHT - NODE_HEIGHT - CANVAS_PADDING,
      Math.max(CANVAS_PADDING, position.y),
    ),
  };
}

function isNodePositionAvailable(
  position: { x: number; y: number },
  nodes: AiWorkflowNodeDefinition[],
) {
  return nodes.every((node) => {
    const frame = getNodeFrame(node);
    return (
      position.x + NODE_WIDTH + NODE_GAP <= frame.x ||
      frame.x + frame.width + NODE_GAP <= position.x ||
      position.y + NODE_HEIGHT + NODE_GAP <= frame.y ||
      frame.y + frame.height + NODE_GAP <= position.y
    );
  });
}

function getPositionNearCurrentNode(nodes: AiWorkflowNodeDefinition[]) {
  const currentNode = selectedNodeId.value
    ? nodes.find((node) => node.id === selectedNodeId.value)
    : nodes[nodes.length - 1];
  if (!currentNode) return undefined;

  const frame = getNodeFrame(currentNode);
  const candidates = getNearbyCandidates(
    { x: frame.x, y: frame.y },
    [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ],
  );
  return candidates.find((position) => isNodePositionAvailable(position, nodes));
}

function getNearbyCandidates(
  anchor: { x: number; y: number },
  offsets: Array<[number, number]>,
) {
  return offsets.map(([column, row]) =>
    clampNodePosition({
      x: anchor.x + column * (NODE_WIDTH + NODE_GAP),
      y: anchor.y + row * (NODE_HEIGHT + NODE_GAP),
    }),
  );
}

function getPositionInVisibleCanvas(nodes: AiWorkflowNodeDefinition[]) {
  const viewport = canvasViewportRef.value;
  if (!viewport) return undefined;
  const anchor = clampNodePosition({
    x: (viewport.clientWidth / 2 - canvasPan.value.x) / canvasZoom.value - NODE_WIDTH / 2,
    y: (viewport.clientHeight / 2 - canvasPan.value.y) / canvasZoom.value - NODE_HEIGHT / 2,
  });
  const candidates = getNearbyCandidates(
    anchor,
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
      [0, 2],
      [2, 0],
      [-2, 0],
      [0, -2],
    ],
  );
  return candidates.find((position) => isNodePositionAvailable(position, nodes));
}

function getNewNodePosition(
  type: AiWorkflowStepType,
  occurrence: number,
  nodes: AiWorkflowNodeDefinition[],
) {
  return (
    getPositionNearCurrentNode(nodes) ??
    getPositionInVisibleCanvas(nodes) ??
    getAiWorkflowNodeDefaultPosition(type, occurrence)
  );
}

function focusNodeIfOutsideViewport(id: string) {
  const viewport = canvasViewportRef.value;
  const node = workflow.value.nodes.find((item) => item.id === id);
  if (!viewport || !node) return;
  const frame = getNodeFrame(node);
  const centerX = canvasPan.value.x + (frame.x + frame.width / 2) * canvasZoom.value;
  const centerY = canvasPan.value.y + (frame.y + frame.height / 2) * canvasZoom.value;
  const padding = 32;
  if (
    centerX >= padding &&
    centerX <= viewport.clientWidth - padding &&
    centerY >= padding &&
    centerY <= viewport.clientHeight - padding
  ) return;

  canvasPan.value = {
    x: viewport.clientWidth / 2 - (frame.x + frame.width / 2) * canvasZoom.value,
    y: viewport.clientHeight / 2 - (frame.y + frame.height / 2) * canvasZoom.value,
  };
}

function addNode(type: AiWorkflowStepType) {
  let id = '';
  updateWorkflow((next) => {
    const count = next.nodes.filter((node) => node.type === type).length;
    id = getNextNodeId(type, next.nodes);
    next.nodes.push({
      id,
      type,
      enabled: true,
      position: getNewNodePosition(type, count, next.nodes),
    });
  });
  selectNode(id);
  focusNodeIfOutsideViewport(id);
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
    return false;
  }
  const duplicate = workflow.value.edges.some(
    (edge) =>
      edge.source === source.id && edge.target === target.id && edge.condition === condition,
  );
  if (duplicate) {
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
  return true;
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

function clampCanvasZoom(value: number) {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, value));
}

function updateCanvasZoom(nextZoom: number, anchor?: { clientX: number; clientY: number }) {
  const viewport = canvasViewportRef.value;
  const zoom = clampCanvasZoom(nextZoom);
  if (!viewport || zoom === canvasZoom.value) return;
  const bounds = viewport.getBoundingClientRect();
  const anchorX = anchor ? anchor.clientX - bounds.left : viewport.clientWidth / 2;
  const anchorY = anchor ? anchor.clientY - bounds.top : viewport.clientHeight / 2;
  const contentX = (anchorX - canvasPan.value.x) / canvasZoom.value;
  const contentY = (anchorY - canvasPan.value.y) / canvasZoom.value;
  canvasZoom.value = zoom;
  canvasPan.value = {
    x: anchorX - contentX * zoom,
    y: anchorY - contentY * zoom,
  };
}

function handleCanvasWheel(event: WheelEvent) {
  const factor = Math.exp(-event.deltaY * 0.0015);
  updateCanvasZoom(canvasZoom.value * factor, event);
}

function zoomCanvasBy(factor: number) {
  updateCanvasZoom(canvasZoom.value * factor);
}

function resetCanvasView() {
  canvasZoom.value = 1;
  canvasPan.value = { x: 0, y: 0 };
}

function fitCanvasView() {
  const viewport = canvasViewportRef.value;
  if (!viewport) return;
  const padding = 24;
  const zoom = clampCanvasZoom(
    Math.min(
      (viewport.clientWidth - padding) / canvasWidth.value,
      (viewport.clientHeight - padding) / CANVAS_HEIGHT,
    ),
  );
  canvasZoom.value = zoom;
  canvasPan.value = {
    x: Math.max(12, (viewport.clientWidth - canvasWidth.value * zoom) / 2),
    y: Math.max(12, (viewport.clientHeight - CANVAS_HEIGHT * zoom) / 2),
  };
}

function startCanvasPan(event: PointerEvent) {
  if (event.button !== 0 || dragState.value || connectionDrag.value) return;
  event.preventDefault();
  clearSelection();
  canvasPanState.value = {
    startX: event.clientX,
    startY: event.clientY,
    originX: canvasPan.value.x,
    originY: canvasPan.value.y,
  };
  window.addEventListener('pointermove', handleCanvasPanMove);
  window.addEventListener('pointerup', stopCanvasPan, { once: true });
}

function handleCanvasPanMove(event: PointerEvent) {
  const state = canvasPanState.value;
  if (!state) return;
  canvasPan.value = {
    x: state.originX + event.clientX - state.startX,
    y: state.originY + event.clientY - state.startY,
  };
}

function stopCanvasPan() {
  canvasPanState.value = null;
  window.removeEventListener('pointermove', handleCanvasPanMove);
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
      x: Math.min(canvasWidth.value - frame.width - 20, Math.max(20, state.originX + (event.clientX - state.startX) / canvasZoom.value)),
      y: Math.min(CANVAS_HEIGHT - frame.height - 20, Math.max(20, state.originY + (event.clientY - state.startY) / canvasZoom.value)),
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
    x: Math.min(canvasWidth.value, Math.max(0, (event.clientX - bounds.left) / canvasZoom.value)),
    y: Math.min(CANVAS_HEIGHT, Math.max(0, (event.clientY - bounds.top) / canvasZoom.value)),
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

function syncCanvasWidth() {
  const viewportWidth = canvasViewportRef.value?.clientWidth ?? 0;
  if (viewportWidth) canvasWidth.value = Math.max(CANVAS_MIN_WIDTH, viewportWidth);
}

onMounted(() => {
  const viewport = canvasViewportRef.value;
  if (!viewport) return;
  syncCanvasWidth();
  canvasViewportResizeObserver = new ResizeObserver(syncCanvasWidth);
  canvasViewportResizeObserver.observe(viewport);
});

onBeforeUnmount(() => {
  stopDrag();
  stopConnection();
  stopCanvasPan();
  nodeResizeObserver?.disconnect();
  canvasViewportResizeObserver?.disconnect();
});
</script>

<template>
  <div class="ai-workflow-editor">
    <div class="ai-workflow-editor__intro">
      新建流程仅保留输入清洗入口。按需从节点库加入节点，并从节点右侧或底部蓝点拖到目标节点建立流向；可在画布空白处按住拖动，滚轮缩放查看完整流程。
    </div>

    <div class="ai-workflow-editor__palette">
      <span class="ai-workflow-editor__palette-label">节点库</span>
      <el-button
        v-for="type in availableNodeTypes"
        :key="type"
        size="small"
        plain
        :class="{ 'is-added': hasAddedNode(type) }"
        @click="addNode(type)"
      >
        + {{ AI_WORKFLOW_STEP_META[type].title }}
      </el-button>
    </div>

    <div class="ai-workflow-editor__layout">
      <div class="ai-workflow-editor__canvas-area">
        <div class="ai-workflow-editor__canvas-toolbar">
          <span>画布视图</span>
          <span class="ai-workflow-editor__canvas-hint">滚轮缩放 · 按住空白处拖动</span>
          <div class="ai-workflow-editor__canvas-actions">
            <el-button size="small" @click="zoomCanvasBy(0.85)">−</el-button>
            <span>{{ canvasZoomLabel }}</span>
            <el-button size="small" @click="zoomCanvasBy(1.18)">+</el-button>
            <el-button size="small" plain @click="fitCanvasView">适应画布</el-button>
            <el-button size="small" text @click="resetCanvasView">重置</el-button>
          </div>
        </div>
        <div
          ref="canvasViewportRef"
          class="ai-workflow-editor__canvas-viewport"
          :style="{ height: `${CANVAS_VIEWPORT_HEIGHT}px` }"
          @wheel.prevent="handleCanvasWheel"
        >
          <div
            ref="canvasRef"
            class="ai-workflow-editor__canvas"
            :class="{ 'is-panning': Boolean(canvasPanState) }"
            :style="canvasStyle"
            @click.self="clearSelection"
            @pointerdown.self="startCanvasPan"
          >
            <svg class="ai-workflow-editor__edges" :viewBox="`0 0 ${canvasWidth} ${CANVAS_HEIGHT}`" aria-label="工作流连线">
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
              <span class="workflow-node__title">{{ AI_WORKFLOW_STEP_META[node.type].title }}</span>
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
        </template>

        <div v-else class="ai-workflow-editor__empty-panel">
          点击画布中的节点后，可查看说明、跳过或从画布移除可选节点。
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-workflow-editor { width: 100%; }
.ai-workflow-editor__intro, .ai-workflow-editor__panel-description, .ai-workflow-editor__locked {
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}
.ai-workflow-editor__palette { display: flex; width: 100%; max-width: 100%; flex-wrap: nowrap; align-items: center; gap: 8px; margin-top: 12px; overflow-x: auto; padding-bottom: 2px; }
.ai-workflow-editor__palette :deep(.el-button) { flex: 0 0 auto; }
.ai-workflow-editor__palette :deep(.el-button.is-added) { border-color: #a0cfff; background: #ecf5ff; color: #409eff; }
.ai-workflow-editor__palette-label { flex: 0 0 auto; white-space: nowrap; }
.ai-workflow-editor__palette-label { color: #303133; font-size: 13px; font-weight: 600; }
.ai-workflow-editor__layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; margin-top: 12px; }
.ai-workflow-editor__canvas-area { min-width: 0; }
.ai-workflow-editor__canvas-toolbar { display: flex; align-items: center; gap: 8px; min-height: 30px; margin-bottom: 6px; color: #303133; font-size: 13px; font-weight: 600; }
.ai-workflow-editor__canvas-hint { color: #909399; font-size: 12px; font-weight: 400; }
.ai-workflow-editor__canvas-actions { display: flex; align-items: center; gap: 4px; margin-left: auto; color: #606266; font-size: 12px; font-weight: 400; white-space: nowrap; }
.ai-workflow-editor__canvas-actions :deep(.el-button) { margin: 0; }
.ai-workflow-editor__canvas-viewport { width: 100%; overflow: hidden; border: 1px solid #d9ecff; border-radius: 8px; background: #f8fbff; touch-action: none; }
.ai-workflow-editor__canvas { position: relative; min-width: 650px; margin: 0; background-image: radial-gradient(#d9ecff 1px, transparent 1px); background-size: 16px 16px; cursor: grab; will-change: transform; }
.ai-workflow-editor__canvas.is-panning { cursor: grabbing; }
.ai-workflow-editor__edges { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.ai-workflow-editor__edges text { font-size: 11px; font-weight: 600; paint-order: stroke; stroke: #f8fbff; stroke-width: 4px; }
.ai-workflow-editor__edge-preview { stroke: #409eff; stroke-width: 2; stroke-dasharray: 5 4; }
.workflow-node { position: absolute; display: flex; box-sizing: border-box; width: 140px; height: 48px; flex-direction: column; justify-content: center; padding: 6px 8px; border: 1px solid #a0cfff; border-radius: 7px; background: #fff; color: #303133; cursor: grab; font: inherit; text-align: center; transition: border-color .2s, box-shadow .2s, opacity .2s; user-select: none; }
.workflow-node:active { cursor: grabbing; }
.workflow-node:hover, .workflow-node.is-active { border-color: #409eff; box-shadow: 0 0 0 2px rgba(64, 158, 255, .16); }
.workflow-node.is-disabled { opacity: .48; }
.workflow-node.is-decision { border-color: #e6a23c; border-radius: 22px; }
.workflow-node.is-terminal { border-color: #67c23a; }
.workflow-node__title { font-size: 13px; font-weight: 600; }
.workflow-node__connector { position: absolute; box-sizing: border-box; width: 12px; height: 12px; border: 2px solid #409eff; border-radius: 50%; }
.workflow-node__connector--input { background: #fff; pointer-events: none; }
.workflow-node__connector--left { top: 50%; left: -6px; transform: translateY(-50%); }
.workflow-node__connector--top { top: -6px; left: 50%; transform: translateX(-50%); }
.workflow-node__connector--output { border-color: #fff; background: #409eff; box-shadow: 0 0 0 1px #409eff; cursor: crosshair; }
.workflow-node__connector--right { top: 50%; right: -6px; transform: translateY(-50%); }
.workflow-node__connector--bottom { bottom: -6px; left: 50%; transform: translateX(-50%); }
.workflow-node__connector--output:hover { background: #79bbff; box-shadow: 0 0 0 3px rgba(64, 158, 255, .18); }
.ai-workflow-editor__panel { box-sizing: border-box; width: 320px; min-width: 0; padding: 14px; border: 1px solid #ebeef5; border-radius: 8px; background: #fff; }
.ai-workflow-editor__empty-panel { display: flex; min-height: 140px; align-items: center; color: #909399; font-size: 13px; line-height: 1.7; }
.ai-workflow-editor__panel-title { margin-bottom: 8px; color: #303133; font-size: 14px; font-weight: 600; }
.ai-workflow-editor__panel :deep(.el-switch) { margin-top: 14px; }
.ai-workflow-editor__delete-node { display: block; margin-top: 12px; }
@media (max-width: 860px) { .ai-workflow-editor__layout { grid-template-columns: 1fr; } .ai-workflow-editor__panel { width: 100%; } .ai-workflow-editor__canvas-toolbar { flex-wrap: wrap; } .ai-workflow-editor__canvas-actions { margin-left: 0; } }
</style>
