<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  getContentArticles,
  deleteContentArticle,
  batchDeleteContentArticles,
  type ContentArticleSummary,
} from '@/api/contentArticle';
import Edit from './Edit.vue';
import View from './View.vue';

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const columns: TableColumn[] = [
  {
    prop: 'coverUrl',
    label: '封面',
    width: 90,
    slot: true,
    showOverflowTooltip: false,
  },
  { prop: 'title', label: '标题', minWidth: 240 },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];
const searchFields: FormField[] = [
  { prop: 'keyword', label: '标题', type: 'input', placeholder: '搜索标题' },
];
const editVisible = ref(false);
const viewVisible = ref(false);
const editingRow = ref<ContentArticleSummary | null>(null);
const viewingRow = ref<ContentArticleSummary | null>(null);
function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}
function handleEdit(row: ContentArticleSummary) {
  editingRow.value = row;
  editVisible.value = true;
}
function handleView(row: ContentArticleSummary) {
  viewingRow.value = row;
  viewVisible.value = true;
}
function deleteRequest(row: ContentArticleSummary) {
  return deleteContentArticle(row.id);
}
function batchDeleteRequest({ ids }: { ids: Array<string | number> }) {
  return batchDeleteContentArticles(ids);
}
</script>

<template>
  <PageContainer title="内容创作">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="getContentArticles"
      :check-able="true"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      perm-module="contentArticle"
      @view="handleView"
      @edit="handleEdit"
    >
      <template #toolbar>
        <Button perm="ContentArticle.create" @click="openCreate"
          >记录想法</Button
        >
        <Button
          perm="ContentArticle.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
          >批量删除</Button
        >
      </template>
      <template #column-coverUrl="{ row }">
        <el-image
          v-if="row.coverUrl"
          class="article-cover"
          :src="row.coverUrl"
          fit="cover"
        />
        <span v-else>—</span>
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

<style scoped>
.article-cover {
  display: block;
  width: 56px;
  height: 36px;
  border-radius: 4px;
}
</style>
