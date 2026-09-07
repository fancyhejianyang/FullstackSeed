<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteKnowledgeRoutingRules,
  deleteKnowledgeRoutingRule,
  getKnowledgeRoutingRules,
  knowledgeRoutingRuleTypeOptions,
  type KnowledgeRoutingRule,
  type KnowledgeRoutingRuleType,
  type QueryKnowledgeRoutingRuleParams,
} from '@/api/knowledgeRoutingRule';
import {
  getKnowledgeRetrievalConfigs,
  type KnowledgeRetrievalConfig,
} from '@/api/knowledgeRetrievalConfig';
import Edit from './Edit.vue';
import View from './View.vue';

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const retrievalConfigs = ref<KnowledgeRetrievalConfig[]>([]);
const editVisible = ref(false);
const viewVisible = ref(false);
const editingRow = ref<KnowledgeRoutingRule | null>(null);
const viewingRow = ref<KnowledgeRoutingRule | null>(null);

const columns: TableColumn[] = [
  { prop: 'term', label: '路由词', minWidth: 150 },
  { prop: 'ruleType', label: '规则类型', width: 120, slot: true },
  { prop: 'matchMode', label: '匹配方式', width: 110, slot: true },
  { prop: 'weight', label: '权重', width: 100 },
  { prop: 'retrievalConfigName', label: '所属检索配置', minWidth: 160 },
  { prop: 'knowledgeBaseNames', label: '目标知识库', minWidth: 180, slot: true },
  { prop: 'documentNames', label: '目标文档', minWidth: 180, slot: true },
  { prop: 'isEnabled', label: '状态', width: 90, slot: true },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields = computed<FormField[]>(() => [
  {
    prop: 'ruleType',
    label: '规则类型',
    type: 'select',
    options: [{ label: '全部', value: '' }, ...knowledgeRoutingRuleTypeOptions],
  },
  {
    prop: 'retrievalConfigId',
    label: '检索配置',
    type: 'select',
    options: [
      { label: '全部', value: '' },
      ...retrievalConfigs.value.map((item) => ({
        label: item.name,
        value: item.id,
      })),
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
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '路由词/说明' },
]);

onMounted(async () => {
  const result = await getKnowledgeRetrievalConfigs({ page: 1, pageSize: 500 });
  retrievalConfigs.value = result.list;
});

function fetchRules(params: Record<string, unknown>) {
  return getKnowledgeRoutingRules(params as QueryKnowledgeRoutingRuleParams);
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleView(row: KnowledgeRoutingRule) {
  viewingRow.value = row;
  viewVisible.value = true;
}

function handleEdit(row: KnowledgeRoutingRule) {
  editingRow.value = row;
  editVisible.value = true;
}

function deleteRequest(row: KnowledgeRoutingRule) {
  return deleteKnowledgeRoutingRule(row.id);
}

async function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteKnowledgeRoutingRules(payload.ids);
}

function getRuleTypeLabel(value: KnowledgeRoutingRuleType) {
  return knowledgeRoutingRuleTypeOptions.find((item) => item.value === value)?.label || value;
}
</script>

<template>
  <PageContainer title="知识库路由规则">
    <Table
      ref="tableRef"
      perm-module="knowledgeRoutingRule"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchRules"
      :check-able="true"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      action-width="180"
      @view="handleView"
      @edit="handleEdit"
    >
      <template #toolbar>
        <Button perm="KnowledgeRoutingRule.create" @click="openCreate">新增路由规则</Button>
        <Button
          perm="KnowledgeRoutingRule.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
        >
          批量删除
        </Button>
      </template>

      <template #column-ruleType="{ row }">
        <el-tag :type="row.ruleType === 'generic' ? 'info' : row.ruleType === 'alias' ? 'primary' : 'success'">
          {{ getRuleTypeLabel(row.ruleType) }}
        </el-tag>
      </template>

      <template #column-matchMode="{ row }">
        {{ row.matchMode === 'exact' ? '精确匹配' : '包含匹配' }}
      </template>

      <template #column-knowledgeBaseNames="{ row }">
        {{ row.knowledgeBaseNames || '—' }}
      </template>

      <template #column-documentNames="{ row }">
        {{ row.documentNames || '—' }}
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
