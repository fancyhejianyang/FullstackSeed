<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteAiFeatureConfigs,
  deleteAiFeatureConfig,
  getAiFeatureConfigs,
  type AiFeatureConfig,
  type AiFeatureType,
  type QueryAiFeatureConfigParams,
} from '@/api/aiFeatureConfig';
import Edit from './Edit.vue';

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();

const featureTypeOptions = [
  { label: '聊天', value: 'chat' },
  { label: '文档解析', value: 'documentParse' },
  { label: 'OCR', value: 'ocr' },
  { label: '向量化', value: 'embedding' },
];

const responseFormatMap = {
  text: '文本',
  json: 'JSON',
  markdown: 'Markdown',
};

const columns: TableColumn[] = [
  { prop: 'name', label: '配置名称', minWidth: 180 },
  { prop: 'featureType', label: '功能类型', width: 120, slot: true },
  { prop: 'providerName', label: '大模型账号', minWidth: 160 },
  { prop: 'model', label: '模型', minWidth: 160 },
  { prop: 'responseFormat', label: '返回格式', width: 120, slot: true },
  { prop: 'isEnabled', label: '状态', width: 90, slot: true },
  { prop: 'description', label: '描述', minWidth: 180 },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields: FormField[] = [
  {
    prop: 'featureType',
    label: '功能类型',
    type: 'select',
    placeholder: '请选择功能类型',
    options: [{ label: '全部', value: '' }, ...featureTypeOptions],
  },
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '配置/账号/模型' },
];

const editVisible = ref(false);
const editingRow = ref<AiFeatureConfig | null>(null);

function fetchConfigs(params: Record<string, unknown>) {
  return getAiFeatureConfigs(params as QueryAiFeatureConfigParams);
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: AiFeatureConfig) {
  editingRow.value = row;
  editVisible.value = true;
}

function deleteRequest(row: AiFeatureConfig) {
  return deleteAiFeatureConfig(row.id);
}

async function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteAiFeatureConfigs(payload.ids);
}

function getFeatureLabel(value: AiFeatureType) {
  return featureTypeOptions.find((item) => item.value === value)?.label || value;
}
</script>

<template>
  <PageContainer title="AI 功能配置">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchConfigs"
      :checkAble="true"
      :show-view="false"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      action-width="190"
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

      <template #column-featureType="{ row }">
        {{ getFeatureLabel(row.featureType) }}
      </template>

      <template #column-responseFormat="{ row }">
        {{ responseFormatMap[row.responseFormat] || row.responseFormat }}
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
