<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  getContentTemplates,
  deleteContentTemplate,
  batchDeleteContentTemplates,
  type ContentTemplateSummary,
} from '@/api/contentTemplate';
import Edit from './Edit.vue';
import View from './View.vue';

// 沿用 demo 的 Table 托管搜索、分页、权限和删除流程。
const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const columns: TableColumn[] = [
  { prop: 'name', label: '模板名称', minWidth: 240 },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];
const searchFields: FormField[] = [
  {
    prop: 'keyword',
    label: '名称',
    type: 'input',
    placeholder: '搜索模板名称',
  },
];
const editVisible = ref(false);
const viewVisible = ref(false);
const editingRow = ref<ContentTemplateSummary | null>(null);
const viewingRow = ref<ContentTemplateSummary | null>(null);
function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}
function handleEdit(row: ContentTemplateSummary) {
  editingRow.value = row;
  editVisible.value = true;
}
function handleView(row: ContentTemplateSummary) {
  viewingRow.value = row;
  viewVisible.value = true;
}
function deleteRequest(row: ContentTemplateSummary) {
  return deleteContentTemplate(row.id);
}
function batchDeleteRequest({ ids }: { ids: Array<string | number> }) {
  return batchDeleteContentTemplates(ids);
}
</script>
<template>
  <PageContainer title="写作模板">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="getContentTemplates"
      :check-able="true"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      perm-module="contentTemplate"
      @view="handleView"
      @edit="handleEdit"
    >
      <template #toolbar>
        <Button perm="ContentTemplate.create" @click="openCreate"
          >新增模板</Button
        >
        <Button
          perm="ContentTemplate.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
          >批量删除</Button
        >
      </template>
      <template #column-updatedAt="{ row }">{{
        formatDateTime(row.updatedAt)
      }}</template>
    </Table>
    <Edit
      v-model:visible="editVisible"
      :row="editingRow"
      @success="tableRef?.refresh()"
    />
    <View v-model:visible="viewVisible" :row="viewingRow" />
  </PageContainer>
</template>
