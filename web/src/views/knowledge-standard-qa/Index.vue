<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteKnowledgeStandardQas,
  deleteKnowledgeStandardQa,
  getKnowledgeStandardQas,
  knowledgeStandardQaStatusOptions,
  type KnowledgeStandardQa,
  type KnowledgeStandardQaStatus,
  type QueryKnowledgeStandardQaParams,
} from '@/api/knowledgeStandardQa';
import { submitStandardQaApproval } from '@/api/approvalRequest';
import { ElMessage } from 'element-plus';
import {
  getKnowledgeRetrievalConfigs,
  type KnowledgeRetrievalConfig,
} from '@/api/knowledgeRetrievalConfig';
import Edit from './Edit.vue';

const tableRef = ref<{ refresh: () => Promise<void>; runBatchDelete: () => Promise<void> }>();
const retrievalConfigs = ref<KnowledgeRetrievalConfig[]>([]);
const editVisible = ref(false);
const editingRow = ref<KnowledgeStandardQa | null>(null);

const columns: TableColumn[] = [
  { prop: 'question', label: '标准问题', minWidth: 230 },
  { prop: 'retrievalConfigName', label: '适用范围', minWidth: 150 },
  { prop: 'priority', label: '优先级', width: 90 },
  { prop: 'matchThreshold', label: '最低匹配度', width: 120 },
  { prop: 'status', label: '状态', width: 100, slot: true },
  { prop: 'hitCount', label: '命中次数', width: 100 },
  { prop: 'reviewedAt', label: '最后审核', width: 180, slot: true },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields = computed<FormField[]>(() => [
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
    prop: 'status',
    label: '状态',
    type: 'select',
    options: [{ label: '全部', value: '' }, ...knowledgeStandardQaStatusOptions],
  },
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '问题、答案或说明' },
]);

onMounted(async () => {
  const result = await getKnowledgeRetrievalConfigs({ page: 1, pageSize: 500 });
  retrievalConfigs.value = result.list;
});

function fetchStandardQas(params: Record<string, unknown>) {
  return getKnowledgeStandardQas(params as QueryKnowledgeStandardQaParams);
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: KnowledgeStandardQa) {
  if (row.status === 'pending') {
    ElMessage.warning('该标准问答正在审批中，暂不能编辑');
    return;
  }
  editingRow.value = row;
  editVisible.value = true;
}

function deleteRequest(row: KnowledgeStandardQa) {
  return deleteKnowledgeStandardQa(row.id);
}

async function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteKnowledgeStandardQas(payload.ids);
}

async function submitApproval(row: KnowledgeStandardQa) {
  await submitStandardQaApproval(row.id);
  ElMessage.success('已提交审批，请等待管理员处理');
  await tableRef.value?.refresh();
}

function getStatusLabel(status: KnowledgeStandardQaStatus) {
  return knowledgeStandardQaStatusOptions.find((item) => item.value === status)?.label || status;
}

function getStatusType(status: KnowledgeStandardQaStatus) {
  if (status === 'published') return 'success';
  if (status === 'disabled') return 'info';
  return 'warning';
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
      action-width="210"
      @edit="handleEdit"
    >
      <template #toolbar>
        <Button perm="KnowledgeStandardQa.create" @click="openCreate">新增标准问答</Button>
        <Button perm="KnowledgeStandardQa.batchDelete" :confirm="false" @click="tableRef?.runBatchDelete()">
          批量删除
        </Button>
      </template>
      <template #column-status="{ row }">
        <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
      </template>
      <template #column-reviewedAt="{ row }">
        {{ row.reviewedAt ? formatDateTime(row.reviewedAt) : '未审核' }}
      </template>
      <template #column-updatedAt="{ row }">
        {{ formatDateTime(row.updatedAt) }}
      </template>
      <template #actions="{ row }">
        <Button
          v-if="row.status === 'draft'"
          perm="KnowledgeStandardQa.update"
          link
          :confirm="true"
          confirm-text="确认提交该标准问答审批？"
          @click="submitApproval(row)"
        >
          提交审批
        </Button>
      </template>
    </Table>
    <Edit v-model:visible="editVisible" :row="editingRow" @success="tableRef?.refresh()" />
  </PageContainer>
</template>
