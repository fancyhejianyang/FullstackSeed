<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type {
  AiWorkflowDefinition,
  AiWorkflowEdgeCondition,
  AiWorkflowNodeDefinition,
  AiWorkflowStepType,
} from '@/api/knowledgeRetrievalConfig';
import {
  AI_WORKFLOW_CONDITION_META,
  AI_WORKFLOW_STEP_META,
  AI_WORKFLOW_STEP_ORDER,
  getAiWorkflowExecutionPlan,
  getAiWorkflowFlags,
  getWorkflowValidationErrors,
  isSafeWorkflowEdge,
  normalizeAiWorkflowDefinition,
} from '@/utils/aiWorkflow';

const model = defineModel<AiWorkflowDefinition>({ required: true });

const NODE_WIDTH = 190;
const NODE_HEIGHT = 70;
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 960;

const selectedNodeId = ref('node-standardQa');
const edgeTargetId = ref('');
const edgeCondition = ref<AiWorkflowEdgeCondition>('unmatched');
const connectionError = ref('');
const dragState = ref<{
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
} | null>(null);

const workflow = computed(() => normalizeAiWorkflowDefinition(model.value));
const workflowFlags = computed(() => getAiWorkflowFlags(workflow.value));
const workflowPlan = computed(() => getAiWorkflowExecutionPlan(workflow.value));
const validationErrors = computed(() => getWorkflowValidationErrors(workflow.value));
const selectedNode = computed(() =>
  workflow.value.nodes.find((node) => node.id === selectedNodeId.value),
);
const selectedMeta = computed(() =>
  selectedNode.value ? AI_WORKFLOW_STEP_META[selectedNode.value.type] : null,
);
const selectedLocked = computed(
  () => selectedNode.value?.type === 'preflight' || selectedNode.value?.type === 'answer',
);
const availableNodeTypes = computed(() => {
  const existing = new Set(workflow.value.nodes.map((node) => node.type));
  return AI_WORKFLOW_STEP_ORDER.filter(
    (type) => !existing.has(type) && type !== 'preflight' && type !== 'answer',
  );
});
const edgeTargetOptions = computed(() => {
  if (!selectedNode.value) return [];
  return workflow.value.nodes.filter((target) =>
    Object.keys(AI_WORKFLOW_CONDITION_META).some((condition) =>
      isSafeWorkflowEdge(
        selectedNode.value!.type,
        target.type,
        condition as AiWorkflowEdgeCondition,
      ),
    ),
  );
});
const availableConditions = computed(() => {
  const source = selectedNode.value;
  const target = workflow.value.nodes.find((node) => node.id === edgeTargetId.value);
  if (!source || !target) return [];
  return (Object.keys(AI_WORKFLOW_CONDITION_META) as AiWorkflowEdgeCondition[]).filter(
    (condition) => isSafeWorkflowEdge(source.type, target.type, condition),
  );
});
watch(edgeTargetId, () => {
  if (!availableConditions.value.includes(edgeCondition.value)) {
    edgeCondition.value = availableConditions.value[0] ?? 'always';
  }
});
const edgeLayouts = computed(() => {
  const nodes = new Map(workflow.value.nodes.map((node) => [node.id, node]));
  return workflow.value.edges.flatMap((edge) => {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source?.position || !target?.position) return [];
    const x1 = source.position.x + NODE_WIDTH / 2;
    const y1 = source.position.y + NODE_HEIGHT;
    const x2 = target.position.x + NODE_WIDTH / 2;
    const y2 = target.position.y;
    return [
      {
        ...edge,
        x1,
        y1,
        x2,
        y2,
        labelX: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2 - 5,
      },
    ];
  });
});

function updateWorkflow(mutator: (next: ReturnType<typeof normalizeAiWorkflowDefinition>) => void) {
  const next = normalizeAiWorkflowDefinition(model.value);
  mutator(next);
  model.value = next;
}

function selectNode(id: string) {
  selectedNodeId.value = id;
  connectionError.value = '';
  const hasTarget = edgeTargetOptions.value.some((node) => node.id === edgeTargetId.value);
  if (!hasTarget) edgeTargetId.value = edgeTargetOptions.value[0]?.id ?? '';
  edgeCondition.value = availableConditions.value[0] ?? 'always';
}

function addNode(type: AiWorkflowStepType) {
  updateWorkflow((next) => {
    next.nodes.push({
      id: `node-${type}`,
      type,
      enabled: true,
      position: { x: 500, y: 500 },
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
  selectNode('node-preflight');
}

function setSelectedEnabled(enabled: boolean) {
  const node = selectedNode.value;
  if (!node || selectedLocked.value) return;
  updateWorkflow((next) => {
    const target = next.nodes.find((item) => item.id === node.id);
    if (target) target.enabled = enabled;
  });
}

function addEdge() {
  const source = selectedNode.value;
  const target = workflow.value.nodes.find((node) => node.id === edgeTargetId.value);
  if (!source || !target || !isSafeWorkflowEdge(source.type, target.type, edgeCondition.value)) {
    connectionError.value = '请选择当前节点允许的目标节点和分支条件。';
    return;
  }
  const duplicate = workflow.value.edges.some(
    (edge) =>
      edge.source === source.id && edge.target === target.id && edge.condition === edgeCondition.value,
  );
  if (duplicate) {
    connectionError.value = '该连线已经存在。';
    return;
  }
  updateWorkflow((next) => {
    next.edges.push({
      id: `edge-${source.id}-${target.id}-${edgeCondition.value}`,
      source: source.id,
      target: target.id,
      condition: edgeCondition.value,
    });
  });
  connectionError.value = '';
}

function removeEdge(id: string) {
  updateWorkflow((next) => {
    next.edges = next.edges.filter((edge) => edge.id !== id);
  });
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
    node.position = {
      x: Math.min(CANVAS_WIDTH - NODE_WIDTH - 20, Math.max(20, state.originX + event.clientX - state.startX)),
      y: Math.min(CANVAS_HEIGHT - NODE_HEIGHT - 20, Math.max(20, state.originY + event.clientY - state.startY)),
    };
  });
}

function stopDrag() {
  dragState.value = null;
  window.removeEventListener('pointermove', handlePointerMove);
}

onBeforeUnmount(stopDrag);
</script>

<template>
  <div class="ai-workflow-editor">
    <div class="ai-workflow-editor__intro">
      可拖拽节点、添加或删除业务节点，并配置安全分支连线。输入清洗与权限范围、回答审计始终保留；业务数据仍只可调用聊天应用已授权的只读指令。
    </div>

    <div class="ai-workflow-editor__palette">
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
      <span v-if="!availableNodeTypes.length" class="ai-workflow-editor__muted">所有可用节点已在画布中</span>
    </div>

    <div class="ai-workflow-editor__layout">
      <div class="ai-workflow-editor__canvas-viewport">
        <div class="ai-workflow-editor__canvas" :style="{ width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px` }">
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
          </svg>

          <button
            v-for="node in workflow.nodes"
            :key="node.id"
            class="workflow-node"
            :class="getNodeClass(node)"
            :style="{ left: `${node.position?.x ?? 20}px`, top: `${node.position?.y ?? 20}px` }"
            type="button"
            @click="selectNode(node.id)"
            @pointerdown="startDrag($event, node)"
          >
            <span class="workflow-node__drag">⋮⋮ 拖拽</span>
            <span class="workflow-node__title">{{ AI_WORKFLOW_STEP_META[node.type].title }}</span>
            <span class="workflow-node__state">{{ node.enabled ? '启用' : '跳过' }}</span>
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
            移除节点
          </el-button>

          <div class="ai-workflow-editor__connection-title">从此节点新增连线</div>
          <div class="ai-workflow-editor__connection-fields">
            <el-select v-model="edgeTargetId" size="small" placeholder="目标节点">
              <el-option
                v-for="node in edgeTargetOptions"
                :key="node.id"
                :label="AI_WORKFLOW_STEP_META[node.type].title"
                :value="node.id"
              />
            </el-select>
            <el-select v-model="edgeCondition" size="small" placeholder="触发条件">
              <el-option
                v-for="condition in availableConditions"
                :key="condition"
                :label="AI_WORKFLOW_CONDITION_META[condition].label"
                :value="condition"
              />
            </el-select>
            <el-button size="small" type="primary" :disabled="!edgeTargetId || !availableConditions.length" @click="addEdge">
              添加连线
            </el-button>
          </div>
          <div v-if="edgeTargetId && AI_WORKFLOW_CONDITION_META[edgeCondition]" class="ai-workflow-editor__condition-tip">
            {{ AI_WORKFLOW_CONDITION_META[edgeCondition].description }}
          </div>
          <div v-if="connectionError" class="ai-workflow-editor__error">{{ connectionError }}</div>
        </template>

        <div class="ai-workflow-editor__connection-title">当前连线</div>
        <div class="ai-workflow-editor__edge-list">
          <div v-for="edge in workflow.edges" :key="edge.id" class="ai-workflow-editor__edge-row">
            <span>{{ AI_WORKFLOW_STEP_META[workflow.nodes.find((node) => node.id === edge.source)?.type ?? 'preflight'].title }}</span>
            <el-tag size="small" effect="light">{{ AI_WORKFLOW_CONDITION_META[edge.condition].label }}</el-tag>
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
.ai-workflow-editor__palette { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.ai-workflow-editor__palette-label, .ai-workflow-editor__connection-title { color: #303133; font-size: 13px; font-weight: 600; }
.ai-workflow-editor__layout { display: grid; grid-template-columns: minmax(620px, 1.75fr) minmax(270px, 0.8fr); gap: 14px; margin-top: 12px; }
.ai-workflow-editor__canvas-viewport { max-height: 760px; overflow: auto; border: 1px solid #d9ecff; border-radius: 8px; background: #f8fbff; }
.ai-workflow-editor__canvas { position: relative; min-width: 720px; background-image: radial-gradient(#d9ecff 1px, transparent 1px); background-size: 16px 16px; }
.ai-workflow-editor__edges { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.ai-workflow-editor__edges text { font-size: 11px; font-weight: 600; paint-order: stroke; stroke: #f8fbff; stroke-width: 4px; }
.workflow-node { position: absolute; display: flex; width: 190px; min-height: 70px; flex-direction: column; justify-content: center; padding: 8px 10px; border: 1px solid #a0cfff; border-radius: 7px; background: #fff; color: #303133; cursor: grab; font: inherit; text-align: center; transition: border-color .2s, box-shadow .2s, opacity .2s; user-select: none; }
.workflow-node:active { cursor: grabbing; }
.workflow-node:hover, .workflow-node.is-active { border-color: #409eff; box-shadow: 0 0 0 2px rgba(64, 158, 255, .16); }
.workflow-node.is-disabled { opacity: .48; }
.workflow-node.is-decision { border-color: #e6a23c; border-radius: 22px; }
.workflow-node.is-terminal { border-color: #67c23a; }
.workflow-node__drag { margin-bottom: 3px; color: #909399; font-size: 10px; }
.workflow-node__title { font-size: 13px; font-weight: 600; }
.workflow-node__state { margin-top: 3px; color: #909399; font-size: 11px; }
.ai-workflow-editor__panel { min-width: 0; padding: 14px; border: 1px solid #ebeef5; border-radius: 8px; background: #fff; }
.ai-workflow-editor__panel-title { margin-bottom: 8px; color: #303133; font-size: 14px; font-weight: 600; }
.ai-workflow-editor__panel :deep(.el-switch) { margin-top: 14px; }
.ai-workflow-editor__delete-node { display: block; margin-top: 12px; }
.ai-workflow-editor__connection-title { margin-top: 18px; padding-top: 12px; border-top: 1px solid #ebeef5; }
.ai-workflow-editor__connection-fields { display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 10px; }
.ai-workflow-editor__condition-tip { margin-top: 6px; }
.ai-workflow-editor__edge-list { display: grid; gap: 7px; margin-top: 10px; }
.ai-workflow-editor__edge-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto; align-items: center; gap: 5px; color: #606266; font-size: 12px; }
.ai-workflow-editor__edge-row > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-workflow-editor__summary { margin-top: 16px; padding-top: 12px; border-top: 1px solid #ebeef5; color: #606266; font-size: 12px; line-height: 1.9; }
.ai-workflow-editor__error { margin-top: 8px; color: #f56c6c; font-size: 12px; line-height: 1.5; }
@media (max-width: 860px) { .ai-workflow-editor__layout { grid-template-columns: 1fr; } }
</style>
