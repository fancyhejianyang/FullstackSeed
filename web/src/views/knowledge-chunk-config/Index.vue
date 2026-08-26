<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteKnowledgeChunkConfigs,
  deleteKnowledgeChunkConfig,
  getKnowledgeChunkConfigs,
  type KnowledgeChunkConfig,
  type KnowledgeChunkMode,
  type KnowledgeChunkSeparator,
  type QueryKnowledgeChunkConfigParams,
} from '@/api/knowledgeChunkConfig';
import Edit from './Edit.vue';

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const editVisible = ref(false);
const editingRow = ref<KnowledgeChunkConfig | null>(null);

const columns: TableColumn[] = [
  { prop: 'name', label: '配置名称', minWidth: 180 },
  { prop: 'chunkMode', label: '分片模式', width: 120, slot: true },
  { prop: 'chunkSize', label: '分片大小', width: 110, slot: true },
  { prop: 'chunkOverlap', label: '重叠字符', width: 110 },
  { prop: 'timeoutMinutes', label: '超时分钟', width: 110, slot: true },
  { prop: 'pdfOcrMaxPages', label: 'PDF OCR页数', width: 120, slot: true },
  { prop: 'separator', label: '切分方式', width: 120, slot: true },
  { prop: 'isDefault', label: '默认', width: 90, slot: true },
  { prop: 'isEnabled', label: '状态', width: 90, slot: true },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields: FormField[] = [
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '配置名称' },
];

function fetchConfigs(params: Record<string, unknown>) {
  return getKnowledgeChunkConfigs(params as QueryKnowledgeChunkConfigParams);
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: KnowledgeChunkConfig) {
  editingRow.value = row;
  editVisible.value = true;
}

function deleteRequest(row: KnowledgeChunkConfig) {
  return deleteKnowledgeChunkConfig(row.id);
}

async function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteKnowledgeChunkConfigs(payload.ids);
}

function getSeparatorLabel(value: KnowledgeChunkSeparator) {
  return value === 'paragraph' ? '段落优先' : '定长';
}

function getModeLabel(value: KnowledgeChunkMode) {
  return value === 'manual' ? '手动' : 'MinerU/自动';
}
</script>

<template>
  <PageContainer title="分片配置">
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

      <template #column-separator="{ row }">
        {{ row.chunkMode === 'manual' ? '-' : getSeparatorLabel(row.separator) }}
      </template>

      <template #column-chunkMode="{ row }">
        <el-tag :type="row.chunkMode === 'manual' ? 'warning' : 'primary'">
          {{ getModeLabel(row.chunkMode) }}
        </el-tag>
      </template>

      <template #column-chunkSize="{ row }">
        {{ row.chunkMode === 'manual' ? '-' : row.chunkSize }}
      </template>

      <template #column-timeoutMinutes="{ row }">
        {{ row.chunkMode === 'manual' ? '-' : row.timeoutMinutes }}
      </template>

      <template #column-pdfOcrMaxPages="{ row }">
        {{ row.chunkMode === 'manual' ? `${row.pdfOcrMaxPages || 8} 页` : '-' }}
      </template>

      <template #column-isDefault="{ row }">
        <el-tag :type="row.isDefault ? 'primary' : 'info'">
          {{ row.isDefault ? '默认' : '普通' }}
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
