<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteVectorConfigs,
  deleteVectorConfig,
  getVectorConfigs,
  type QueryVectorConfigParams,
  type VectorConfig,
} from '@/api/vectorConfig';
import Edit from './Edit.vue';

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();

const columns: TableColumn[] = [
  { prop: 'name', label: '配置名称', minWidth: 180 },
  { prop: 'vectorDbType', label: '数据库类型', width: 120 },
  { prop: 'chromaUrl', label: '服务地址', minWidth: 220 },
  { prop: 'collectionName', label: 'Collection', minWidth: 160 },
  { prop: 'tenant', label: 'Tenant', minWidth: 140 },
  { prop: 'database', label: 'Database', minWidth: 140 },
  { prop: 'tokenSet', label: '令牌', width: 90, slot: true },
  { prop: 'isEnabled', label: '状态', width: 90, slot: true },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields: FormField[] = [
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '名称/地址/Collection' },
];

const editVisible = ref(false);
const editingRow = ref<VectorConfig | null>(null);

function fetchConfigs(params: Record<string, unknown>) {
  return getVectorConfigs(params as QueryVectorConfigParams);
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: VectorConfig) {
  editingRow.value = row;
  editVisible.value = true;
}

function deleteRequest(row: VectorConfig) {
  return deleteVectorConfig(row.id);
}

async function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteVectorConfigs(payload.ids);
}
</script>

<template>
  <PageContainer title="向量化配置">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchConfigs"
      :checkAble="true"
      :show-view="false"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
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

      <template #column-tokenSet="{ row }">
        <el-tag :type="row.tokenSet ? 'success' : 'info'">
          {{ row.tokenSet ? '已配置' : '未配置' }}
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
