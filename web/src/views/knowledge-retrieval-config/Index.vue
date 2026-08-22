<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteKnowledgeRetrievalConfigs,
  deleteKnowledgeRetrievalConfig,
  getKnowledgeRetrievalConfigs,
  type KnowledgeRetrievalConfig,
  type KnowledgeRetrievalMode,
  type QueryKnowledgeRetrievalConfigParams,
} from '@/api/knowledgeRetrievalConfig';
import Edit from './Edit.vue';

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();

const retrievalModeOptions = [
  { label: '全文检索', value: 'fullText' },
  { label: '向量检索', value: 'vector' },
  { label: '混合检索', value: 'hybrid' },
];

const columns: TableColumn[] = [
  { prop: 'name', label: '配置名称', minWidth: 180 },
  { prop: 'retrievalMode', label: '检索模式', width: 120, slot: true },
  { prop: 'knowledgeBaseNames', label: '知识库范围', minWidth: 220, slot: true },
  { prop: 'topK', label: '召回上限', width: 100 },
  { prop: 'minScore', label: '最低分', width: 100 },
  { prop: 'enableRerank', label: '重排', width: 90, slot: true },
  { prop: 'isEnabled', label: '状态', width: 90, slot: true },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields: FormField[] = [
  {
    prop: 'retrievalMode',
    label: '检索模式',
    type: 'select',
    options: [{ label: '全部', value: '' }, ...retrievalModeOptions],
  },
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '配置/知识库/描述' },
];

const editVisible = ref(false);
const editingRow = ref<KnowledgeRetrievalConfig | null>(null);

function fetchConfigs(params: Record<string, unknown>) {
  return getKnowledgeRetrievalConfigs(params as QueryKnowledgeRetrievalConfigParams);
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: KnowledgeRetrievalConfig) {
  editingRow.value = row;
  editVisible.value = true;
}

function deleteRequest(row: KnowledgeRetrievalConfig) {
  return deleteKnowledgeRetrievalConfig(row.id);
}

async function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteKnowledgeRetrievalConfigs(payload.ids);
}

function getModeLabel(mode: KnowledgeRetrievalMode) {
  return retrievalModeOptions.find((item) => item.value === mode)?.label || mode;
}

function getScopeText(row: KnowledgeRetrievalConfig) {
  const parts = [
    row.categoryNames ? `分类：${row.categoryNames}` : '',
    row.knowledgeBaseNames ? `文档：${row.knowledgeBaseNames}` : '',
  ].filter(Boolean);
  return parts.join('；') || '全部启用知识库';
}
</script>

<template>
  <PageContainer title="知识库检索配置">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchConfigs"
      :checkAble="true"
      :show-view="false"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      action-width="150"
      @edit="handleEdit"
    >
      <template #toolbar>
        <Button type="primary" icon="Plus" @click="openCreate">新增配置</Button>
        <Button
          icon="Delete"
          type="danger"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
        >
          批量删除
        </Button>
      </template>

      <template #column-retrievalMode="{ row }">
        {{ getModeLabel(row.retrievalMode) }}
      </template>

      <template #column-knowledgeBaseNames="{ row }">
        {{ getScopeText(row) }}
      </template>

      <template #column-enableRerank="{ row }">
        <el-tag :type="row.enableRerank ? 'success' : 'info'">
          {{ row.enableRerank ? '启用' : '关闭' }}
        </el-tag>
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
