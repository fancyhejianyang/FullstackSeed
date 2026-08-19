<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteExternalApps,
  deleteExternalApp,
  getExternalApps,
  type ExternalApp,
  type QueryExternalAppParams,
} from '@/api/externalApp';
import Edit from './Edit.vue';

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();

const columns: TableColumn[] = [
  { prop: 'name', label: '应用名称', minWidth: 180 },
  { prop: 'appId', label: 'AppId', minWidth: 240, slot: true },
  { prop: 'domain', label: '白名单域名', minWidth: 260, slot: true },
  { prop: 'isEnabled', label: '状态', width: 90, slot: true },
  { prop: 'description', label: '描述', minWidth: 180 },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields: FormField[] = [
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '应用名称/AppId/域名' },
];

const editVisible = ref(false);
const editingRow = ref<ExternalApp | null>(null);

function fetchApps(params: Record<string, unknown>) {
  return getExternalApps(params as QueryExternalAppParams);
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: ExternalApp) {
  editingRow.value = row;
  editVisible.value = true;
}

function deleteRequest(row: ExternalApp) {
  return deleteExternalApp(row.id);
}

async function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteExternalApps(payload.ids);
}

function splitDomains(domain: string | null) {
  return (domain || '')
    .split(/[\s,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
</script>

<template>
  <PageContainer title="聊天应用">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchApps"
      :checkAble="true"
      :show-view="false"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      @edit="handleEdit"
    >
      <template #toolbar>
        <Button type="primary" icon="Plus" @click="openCreate">新增应用</Button>
        <Button
          icon="Delete"
          type="danger"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
        >
          批量删除
        </Button>
      </template>

      <template #column-appId="{ row }">
        <el-text class="external-app__appid">{{ row.appId }}</el-text>
      </template>

      <template #column-domain="{ row }">
        <div class="external-app__domains">
          <el-tag
            v-for="domain in splitDomains(row.domain)"
            :key="domain"
            type="info"
          >
            {{ domain }}
          </el-tag>
          <el-tag v-if="!splitDomains(row.domain).length" type="warning">
            不校验
          </el-tag>
        </div>
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
.external-app__appid {
  font-family: Consolas, Monaco, monospace;
}

.external-app__domains {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
