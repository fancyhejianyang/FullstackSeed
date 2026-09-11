<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
  AiWorkflowDefinition,
  AiWorkflowStepType,
} from '@/api/knowledgeRetrievalConfig';
import {
  AI_WORKFLOW_STEP_META,
  getAiWorkflowFlags,
  isAiWorkflowStepEnabled,
  normalizeAiWorkflowDefinition,
} from '@/utils/aiWorkflow';

const model = defineModel<AiWorkflowDefinition>({ required: true });

const selectedType = ref<AiWorkflowStepType>('standardQa');
const normalizedWorkflow = computed(() => normalizeAiWorkflowDefinition(model.value));
const workflowFlags = computed(() => getAiWorkflowFlags(normalizedWorkflow.value));
const selectedMeta = computed(() => AI_WORKFLOW_STEP_META[selectedType.value]);
const selectedEnabled = computed(() =>
  isAiWorkflowStepEnabled(normalizedWorkflow.value, selectedType.value),
);
const selectedLocked = computed(
  () => selectedType.value === 'preflight' || selectedType.value === 'answer',
);

function isEnabled(type: AiWorkflowStepType) {
  return isAiWorkflowStepEnabled(normalizedWorkflow.value, type);
}

function selectNode(type: AiWorkflowStepType) {
  selectedType.value = type;
}

function setStepEnabled(type: AiWorkflowStepType, enabled: boolean) {
  if (type === 'preflight' || type === 'answer') return;
  if (type === 'rerank' && enabled && !isEnabled('knowledgeRetrieval')) return;
  const next = normalizeAiWorkflowDefinition(model.value);
  const step = next.steps.find((item) => item.type === type);
  if (step) step.enabled = enabled;
  if (type === 'knowledgeRetrieval' && !enabled) {
    const rerank = next.steps.find((item) => item.type === 'rerank');
    if (rerank) rerank.enabled = false;
  }
  model.value = next;
}

function getNodeClass(type: AiWorkflowStepType) {
  return {
    'is-active': selectedType.value === type,
    'is-disabled': !isEnabled(type),
    [`is-${AI_WORKFLOW_STEP_META[type].kind}`]: true,
  };
}
</script>

<template>
  <div class="ai-workflow-editor">
    <div class="ai-workflow-editor__intro">
      工作流按受约束的客服链路运行：可以启停业务步骤，命中与未命中分支由系统安全地自动处理，不能连接任意接口或绕过权限校验。
    </div>

    <div class="ai-workflow-editor__layout">
      <div class="ai-workflow-editor__canvas" aria-label="AI 工作流图">
        <button
          class="workflow-node"
          :class="getNodeClass('preflight')"
          type="button"
          @click="selectNode('preflight')"
        >
          <span class="workflow-node__eyebrow">固定前置</span>
          {{ AI_WORKFLOW_STEP_META.preflight.title }}
        </button>
        <div class="workflow-line" />

        <button
          class="workflow-node workflow-node--decision"
          :class="getNodeClass('standardQa')"
          type="button"
          @click="selectNode('standardQa')"
        >
          ◇ {{ AI_WORKFLOW_STEP_META.standardQa.title }}
        </button>
        <div class="workflow-branch">
          <span class="workflow-branch__hit">命中 → 固定答案 → 返回</span>
          <span class="workflow-branch__miss">未命中 ↓</span>
        </div>
        <div class="workflow-line" />

        <button
          class="workflow-node"
          :class="getNodeClass('colloquial')"
          type="button"
          @click="selectNode('colloquial')"
        >
          {{ AI_WORKFLOW_STEP_META.colloquial.title }}
        </button>
        <div class="workflow-line" />

        <button
          class="workflow-node workflow-node--decision"
          :class="getNodeClass('calibratedStandardQa')"
          type="button"
          @click="selectNode('calibratedStandardQa')"
        >
          ◇ {{ AI_WORKFLOW_STEP_META.calibratedStandardQa.title }}
        </button>
        <div class="workflow-branch">
          <span class="workflow-branch__hit">命中 → 固定答案 → 返回</span>
          <span class="workflow-branch__miss">未命中 ↓</span>
        </div>
        <div class="workflow-line" />

        <div class="workflow-lanes">
          <button
            class="workflow-node"
            :class="getNodeClass('businessCommand')"
            type="button"
            @click="selectNode('businessCommand')"
          >
            {{ AI_WORKFLOW_STEP_META.businessCommand.title }}
            <span class="workflow-node__sub">命中 / 未命中都汇入回答上下文</span>
          </button>
          <button
            class="workflow-node"
            :class="getNodeClass('knowledgeRetrieval')"
            type="button"
            @click="selectNode('knowledgeRetrieval')"
          >
            {{ AI_WORKFLOW_STEP_META.knowledgeRetrieval.title }}
            <span class="workflow-node__sub">路由 → 召回 → 阈值筛选</span>
          </button>
          <button
            class="workflow-node workflow-node--nested"
            :class="getNodeClass('rerank')"
            type="button"
            @click="selectNode('rerank')"
          >
            {{ AI_WORKFLOW_STEP_META.rerank.title }}
          </button>
        </div>
        <div class="workflow-line" />

        <button
          class="workflow-node workflow-node--terminal"
          :class="getNodeClass('answer')"
          type="button"
          @click="selectNode('answer')"
        >
          {{ AI_WORKFLOW_STEP_META.answer.title }}
          <span class="workflow-node__sub">资料不足时澄清、拒答或转人工</span>
        </button>
      </div>

      <div class="ai-workflow-editor__panel">
        <div class="ai-workflow-editor__panel-title">{{ selectedMeta.title }}</div>
        <div class="ai-workflow-editor__panel-description">{{ selectedMeta.description }}</div>
        <el-switch
          v-if="!selectedLocked"
          :model-value="selectedEnabled"
          :disabled="selectedType === 'rerank' && !workflowFlags.enableKnowledgeRetrieval"
          active-text="启用该步骤"
          inactive-text="跳过该步骤"
          @update:model-value="setStepEnabled(selectedType, $event)"
        />
        <div v-else class="ai-workflow-editor__locked">此步骤为系统固定节点，不能关闭。</div>

        <div class="ai-workflow-editor__summary">
          <div>标准问答：{{ workflowFlags.enableStandardQa ? '启用' : '关闭' }}</div>
          <div>口语校准：{{ workflowFlags.enableColloquial ? '启用' : '关闭' }}</div>
          <div>知识库检索：{{ workflowFlags.enableKnowledgeRetrieval ? '启用' : '关闭' }}</div>
          <div>业务数据指令：{{ workflowFlags.enableBusinessCommands ? '启用' : '关闭' }}</div>
          <div>LLM 重排：{{ workflowFlags.enableRerank ? '启用' : '关闭' }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-workflow-editor {
  width: 100%;
}

.ai-workflow-editor__intro,
.ai-workflow-editor__panel-description,
.ai-workflow-editor__locked {
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.ai-workflow-editor__layout {
  display: grid;
  grid-template-columns: minmax(380px, 1.6fr) minmax(220px, 0.8fr);
  gap: 14px;
  margin-top: 10px;
}

.ai-workflow-editor__canvas {
  display: flex;
  min-height: 610px;
  flex-direction: column;
  align-items: center;
  padding: 14px;
  border: 1px solid #d9ecff;
  border-radius: 8px;
  background: #f8fbff;
}

.workflow-node {
  width: min(100%, 310px);
  padding: 9px 12px;
  border: 1px solid #a0cfff;
  border-radius: 6px;
  background: #fff;
  color: #303133;
  cursor: pointer;
  font: inherit;
  text-align: center;
  transition: 0.2s ease;
}

.workflow-node:hover,
.workflow-node.is-active {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.14);
}

.workflow-node.is-disabled {
  border-color: #dcdfe6;
  background: #f5f7fa;
  color: #a8abb2;
}

.workflow-node--decision {
  border-radius: 18px;
  border-color: #e6a23c;
}

.workflow-node--terminal {
  border-color: #67c23a;
}

.workflow-node--nested {
  width: 86%;
  margin-top: 8px;
}

.workflow-node__eyebrow,
.workflow-node__sub {
  display: block;
  margin-top: 2px;
  color: #909399;
  font-size: 11px;
  font-weight: 400;
}

.workflow-node__eyebrow {
  margin-top: 0;
  color: #409eff;
}

.workflow-line {
  width: 1px;
  height: 16px;
  background: #a0cfff;
}

.workflow-branch {
  display: flex;
  width: min(100%, 360px);
  justify-content: space-between;
  padding: 7px 2px 0;
  font-size: 11px;
}

.workflow-branch__hit {
  color: #67c23a;
}

.workflow-branch__miss {
  color: #909399;
}

.workflow-lanes {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.workflow-lanes .workflow-node {
  width: 100%;
}

.workflow-lanes .workflow-node--nested {
  grid-column: 2;
}

.ai-workflow-editor__panel {
  padding: 14px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fff;
}

.ai-workflow-editor__panel-title {
  margin-bottom: 8px;
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.ai-workflow-editor__panel :deep(.el-switch) {
  margin-top: 14px;
}

.ai-workflow-editor__summary {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
  color: #606266;
  font-size: 12px;
  line-height: 1.9;
}

@media (max-width: 760px) {
  .ai-workflow-editor__layout {
    grid-template-columns: 1fr;
  }
}
</style>
