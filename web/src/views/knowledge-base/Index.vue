<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteKnowledgeBases,
  deleteKnowledgeBase,
  getKnowledgeBases,
  type KnowledgeBase,
} from '@/api/knowledgeBase';
import Edit from './Edit.vue';
import View from './View.vue';

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();

const columns: TableColumn[] = [
  { prop: 'name', label: '名称', minWidth: 180 },
  { prop: 'code', label: '编码', minWidth: 140 },
  { prop: 'isEnabled', label: '状态', width: 90, slot: true },
  { prop: 'sort', label: '排序', width: 90 },
  { prop: 'description', label: '描述', minWidth: 220 },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields: FormField[] = [
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '名称/编码/描述' },
];

const editVisible = ref(false);
const viewVisible = ref(false);
const editingRow = ref<KnowledgeBase | null>(null);
const viewingRow = ref<KnowledgeBase | null>(null);

function fetchKnowledgeBases(params: Record<string, unknown>) {
  return getKnowledgeBases(params);
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: KnowledgeBase) {
  editingRow.value = row;
  editVisible.value = true;
}

function handleView(row: KnowledgeBase) {
  viewingRow.value = row;
  viewVisible.value = true;
}

function deleteRequest(row: KnowledgeBase) {
  return deleteKnowledgeBase(row.id);
}

async function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteKnowledgeBases(payload.ids);
}
</script>

<template>
  <PageContainer title="知识库列表">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchKnowledgeBases"
      :checkAble="true"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      perm-module="knowledgeBase"
      @view="handleView"
      @edit="handleEdit"
    >
      <template #toolbar>
        <Button perm="KnowledgeBase.create" icon="Plus" @click="openCreate">
          新增知识库
        </Button>
        <Button
          perm="KnowledgeBase.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
        >
          批量删除
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

    <View v-model:visible="viewVisible" :row="viewingRow" />
  </PageContainer>
</template>
