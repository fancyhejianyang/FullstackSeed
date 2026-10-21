<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteKnowledgeStandardQas,
  deleteKnowledgeStandardQa,
  getKnowledgeStandardQas,
  type KnowledgeStandardQa,
  type QueryKnowledgeStandardQaParams,
} from '@/api/knowledgeStandardQa';
import Edit from './Edit.vue';

const tableRef = ref<{ refresh: () => Promise<void>; runBatchDelete: () => Promise<void> }>();
const editVisible = ref(false);
const editingRow = ref<KnowledgeStandardQa | null>(null);

const columns: TableColumn[] = [
  { prop: 'question', label: '标准问题', minWidth: 230 },
  { prop: 'isActive', label: '状态', width: 100, slot: true },
  { prop: 'hitCount', label: '命中次数', width: 100 },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields: FormField[] = [
  {
    prop: 'isActive',
    label: '状态',
    type: 'select',
    options: [
      { label: '全部', value: '' },
      { label: '启用', value: true },
      { label: '停用', value: false },
    ],
  },
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '标准问题或标准答案' },
];

function fetchStandardQas(params: Record<string, unknown>) {
  return getKnowledgeStandardQas(params as QueryKnowledgeStandardQaParams);
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: KnowledgeStandardQa) {
  editingRow.value = row;
  editVisible.value = true;
}

function deleteRequest(row: KnowledgeStandardQa) {
  return deleteKnowledgeStandardQa(row.id);
}

async function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteKnowledgeStandardQas(payload.ids);
}

</script>

<template>
  <PageContainer title="标准问答库">
    <Table
      ref="tableRef"
      perm-module="knowledgeStandardQa"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchStandardQas"
      :check-able="true"
      :show-view="false"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      action-width="160"
      @edit="handleEdit"
    >
      <template #toolbar>
        <Button perm="KnowledgeStandardQa.create" @click="openCreate">新增标准问答</Button>
        <Button perm="KnowledgeStandardQa.batchDelete" :confirm="false" @click="tableRef?.runBatchDelete()">
          批量删除
        </Button>
      </template>
      <template #column-isActive="{ row }">
        <el-tag :type="row.isActive ? 'success' : 'info'">{{ row.isActive ? '启用' : '停用' }}</el-tag>
      </template>
      <template #column-updatedAt="{ row }">
        {{ formatDateTime(row.updatedAt) }}
      </template>
    </Table>
    <Edit v-model:visible="editVisible" :row="editingRow" @success="tableRef?.refresh()" />
  </PageContainer>
</template>
