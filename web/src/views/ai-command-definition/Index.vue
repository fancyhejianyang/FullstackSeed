<script setup lang="ts">
import { computed, ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  getAiCommandDefinitions,
  type AiCommandDefinition,
  type QueryAiCommandDefinitionParams,
} from '@/api/aiCommandDefinition';
import Edit from './Edit.vue';

const tableRef = ref<{ refresh: () => Promise<void> }>();
const editVisible = ref(false);
const editingRow = ref<AiCommandDefinition | null>(null);

const columns: TableColumn[] = [
  { prop: 'commandKey', label: '指令标识', minWidth: 170 },
  { prop: 'name', label: '指令名称', minWidth: 130 },
  { prop: 'action', label: '动作', width: 95, slot: true },
  { prop: 'executionTarget', label: '执行目标', minWidth: 250 },
  { prop: 'apiPath', label: '调用映射', minWidth: 230, slot: true },
  { prop: 'chatCallable', label: '聊天调用', width: 100, slot: true },
  { prop: 'requireApproval', label: '人工确认', width: 100, slot: true },
  { prop: 'isEnabled', label: '状态', width: 90, slot: true },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields = computed<FormField[]>(() => [
  {
    prop: 'chatCallable',
    label: '聊天调用',
    type: 'select',
    options: [
      { label: '全部', value: '' },
      { label: '允许', value: true },
      { label: '禁止', value: false },
    ],
  },
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
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '指令、名称、处理器或说明' },
]);

function fetchDefinitions(params: Record<string, unknown>) {
  return getAiCommandDefinitions(params as QueryAiCommandDefinitionParams);
}

function handleEdit(row: AiCommandDefinition) {
  editingRow.value = row;
  editVisible.value = true;
}

function getActionLabel(action: AiCommandDefinition['action']) {
  const labels = { read: '查询', create: '新增', update: '修改', delete: '删除', execute: '执行' };
  return labels[action];
}

function getActionType(action: AiCommandDefinition['action']) {
  const types = { read: 'info', create: 'success', update: 'primary', delete: 'danger', execute: 'warning' } as const;
  return types[action];
}
</script>

<template>
  <PageContainer title="AI 指令集">
    <Table
      ref="tableRef"
      perm-module="aiCommandDefinition"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchDefinitions"
      :show-view="false"
      :show-delete="false"
      action-width="90"
      @edit="handleEdit"
    >
      <template #column-action="{ row }">
        <el-tag :type="getActionType(row.action)">{{ getActionLabel(row.action) }}</el-tag>
      </template>
      <template #column-apiPath="{ row }">
        <code>{{ row.apiMethod }} {{ row.apiPath }}</code>
      </template>
      <template #column-chatCallable="{ row }">
        <el-tag :type="row.chatCallable ? 'success' : 'info'">{{ row.chatCallable ? '允许' : '禁止' }}</el-tag>
      </template>
      <template #column-requireApproval="{ row }">
        <el-tag :type="row.requireApproval ? 'warning' : 'info'">{{ row.requireApproval ? '需要' : '不需要' }}</el-tag>
      </template>
      <template #column-isEnabled="{ row }">
        <el-tag :type="row.isEnabled ? 'success' : 'info'">{{ row.isEnabled ? '启用' : '停用' }}</el-tag>
      </template>
      <template #column-updatedAt="{ row }">
        {{ formatDateTime(row.updatedAt) }}
      </template>
    </Table>
    <Edit v-model:visible="editVisible" :row="editingRow" @success="tableRef?.refresh()" />
  </PageContainer>
</template>
