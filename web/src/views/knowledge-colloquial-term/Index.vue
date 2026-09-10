<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteKnowledgeColloquialTerms,
  deleteKnowledgeColloquialTerm,
  getKnowledgeColloquialTerms,
  knowledgeColloquialSemanticTypeOptions,
  type KnowledgeColloquialSemanticType,
  type KnowledgeColloquialTerm,
  type QueryKnowledgeColloquialTermParams,
} from '@/api/knowledgeColloquialTerm';
import {
  getKnowledgeRetrievalConfigs,
  type KnowledgeRetrievalConfig,
} from '@/api/knowledgeRetrievalConfig';
import Edit from './Edit.vue';

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const retrievalConfigs = ref<KnowledgeRetrievalConfig[]>([]);
const editVisible = ref(false);
const editingRow = ref<KnowledgeColloquialTerm | null>(null);

const columns: TableColumn[] = [
  { prop: 'term', label: '口语表达', minWidth: 150 },
  { prop: 'replacement', label: '标准替换文本', minWidth: 210 },
  { prop: 'semanticType', label: '表达类型', width: 120, slot: true },
  { prop: 'retrievalConfigName', label: '适用范围', minWidth: 150, slot: true },
  { prop: 'isEnabled', label: '状态', width: 90, slot: true },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields = computed<FormField[]>(() => [
  {
    prop: 'semanticType',
    label: '表达类型',
    type: 'select',
    options: [{ label: '全部', value: '' }, ...knowledgeColloquialSemanticTypeOptions],
  },
  {
    prop: 'retrievalConfigId',
    label: '适用范围',
    type: 'select',
    options: [
      { label: '全部', value: '' },
      ...retrievalConfigs.value.map((item) => ({ label: item.name, value: item.id })),
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
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '口语词、替换文本或释义' },
]);

onMounted(async () => {
  const result = await getKnowledgeRetrievalConfigs({ page: 1, pageSize: 500 });
  retrievalConfigs.value = result.list;
});

function fetchTerms(params: Record<string, unknown>) {
  return getKnowledgeColloquialTerms(params as QueryKnowledgeColloquialTermParams);
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: KnowledgeColloquialTerm) {
  editingRow.value = row;
  editVisible.value = true;
}

function deleteRequest(row: KnowledgeColloquialTerm) {
  return deleteKnowledgeColloquialTerm(row.id);
}

async function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteKnowledgeColloquialTerms(payload.ids);
}

function getSemanticTypeLabel(value: KnowledgeColloquialSemanticType) {
  return knowledgeColloquialSemanticTypeOptions.find((item) => item.value === value)?.label || value;
}

</script>

<template>
  <PageContainer title="口语化表达词库">
    <Table
      ref="tableRef"
      perm-module="knowledgeColloquialTerm"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchTerms"
      :check-able="true"
      :show-view="false"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      action-width="160"
      @edit="handleEdit"
    >
      <template #toolbar>
        <Button perm="KnowledgeColloquialTerm.create" @click="openCreate">新增口语表达</Button>
        <Button
          perm="KnowledgeColloquialTerm.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
        >
          批量删除
        </Button>
      </template>

      <template #column-semanticType="{ row }">
        <el-tag :type="row.semanticType === 'product-alias' ? 'primary' : 'info'">
          {{ getSemanticTypeLabel(row.semanticType) }}
        </el-tag>
      </template>

      <template #column-retrievalConfigName="{ row }">
        {{ row.retrievalConfigName || '全局' }}
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

    <Edit v-model:visible="editVisible" :row="editingRow" @success="tableRef?.refresh()" />
  </PageContainer>
</template>
