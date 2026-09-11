<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import { getAiWorkflowFlags } from '@/utils/aiWorkflow';
import {
  batchDeleteAiWorkflows,
  deleteAiWorkflow,
  getAiWorkflows,
  type AiWorkflow,
  type QueryAiWorkflowParams,
} from '@/api/aiWorkflow';
import Edit from './Edit.vue';

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();

const columns: TableColumn[] = [
  { prop: 'name', label: '工作流名称', minWidth: 180, slot: true },
  { prop: 'workflowDefinition', label: '流程能力', minWidth: 250, slot: true },
  { prop: 'aiInstruction', label: 'AI 执行说明', minWidth: 260 },
  { prop: 'isEnabled', label: '状态', width: 90, slot: true },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields: FormField[] = [
  {
    prop: 'isEnabled',
    label: '启用状态',
    type: 'select',
    options: [
      { label: '全部', value: '' },
      { label: '启用', value: true },
      { label: '停用', value: false },
    ],
  },
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '名称、AI 说明或描述' },
];

const editVisible = ref(false);
const editingRow = ref<AiWorkflow | null>(null);

function fetchWorkflows(params: Record<string, unknown>) {
  return getAiWorkflows(params as QueryAiWorkflowParams);
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: AiWorkflow) {
  editingRow.value = row;
  editVisible.value = true;
}

function getFlowSummary(row: AiWorkflow) {
  const flags = getAiWorkflowFlags(row.workflowDefinition);
  const labels = [
    flags.enableStandardQa ? '标准问答' : '',
    flags.enableColloquial ? '口语校准' : '',
    flags.enableBusinessCommands ? '业务指令' : '',
    flags.enableKnowledgeRetrieval ? '知识库检索' : '',
    flags.enableRerank ? 'LLM 重排' : '',
  ].filter(Boolean);
  return labels.join(' · ') || '仅保留回答流程';
}
</script>

<template>
  <PageContainer title="AI 工作流">
    <Table
      ref="tableRef"
      perm-module="aiWorkflow"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchWorkflows"
      :check-able="true"
      :delete-request="(row) => deleteAiWorkflow(row.id)"
      :batch-delete-request="({ ids }) => batchDeleteAiWorkflows(ids)"
      :show-view="false"
      action-width="150"
      @edit="handleEdit"
    >
      <template #toolbar>
        <Button perm="AiWorkflow.create" @click="openCreate">新增工作流</Button>
        <Button
          perm="AiWorkflow.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
        >
          批量删除
        </Button>
      </template>

      <template #column-workflowDefinition="{ row }">
        {{ getFlowSummary(row) }}
      </template>

      <template #column-name="{ row }">
        <Button
          class="ai-workflow-name-link"
          perm="AiWorkflow.read"
          link
          :auto-type="false"
          :auto-icon="false"
          :confirm="false"
          @click="handleEdit(row)"
        >
          {{ row.name }}
        </Button>
      </template>

      <template #column-isEnabled="{ row }">
        <el-tag :type="row.isEnabled ? 'success' : 'info'">
          {{ row.isEnabled ? '启用' : '停用' }}
        </el-tag>
      </template>

      <template #column-updatedAt="{ row }">
        {{ formatDateTime(row.updatedAt) }}
      </template>
    </Table>

    <Edit
      v-model:visible="editVisible"
      :row="editingRow"
      @success="tableRef?.refresh()"
    />
  </PageContainer>
</template>

<style scoped>
:deep(.ai-workflow-name-link) {
  padding: 0;
  color: #409eff;
  font-weight: 600;
  text-decoration: none;
}

:deep(.ai-workflow-name-link:hover),
:deep(.ai-workflow-name-link:focus-visible) {
  color: #79bbff;
  text-decoration: underline;
}
</style>
