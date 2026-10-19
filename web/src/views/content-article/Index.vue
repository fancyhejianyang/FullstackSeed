<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';
import { taskColor, taskLabel, isActiveTask } from './taskState';
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
import Generate from './Generate.vue';
import Edit from './Edit.vue';
import View from './View.vue';

const user = useUserStore();
const tableRef = ref<{
  refresh: () => Promise<void>;
  clearSelection: () => void;
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
  { prop: 'latestTask', label: '生成状态', width: 110, slot: true },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];
let timer: ReturnType<typeof setTimeout> | undefined;
let alive = true;
let requestSequence = 0;
async function fetchArticles(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
}) {
  clearTimeout(timer);
  const sequence = ++requestSequence;
  const result = await getContentArticles(params);
  if (
    alive &&
    sequence === requestSequence &&
    result.list.some((row) => isActiveTask(row.latestTask))
  ) {
    timer = setTimeout(() => {
      void tableRef.value?.refresh().catch(() => undefined);
    }, 4000);
  }
  return result;
}
onBeforeUnmount(() => {
  alive = false;
  ++requestSequence;
  clearTimeout(timer);
});
const searchFields: FormField[] = [
  { prop: 'keyword', label: '标题', type: 'input', placeholder: '搜索标题' },
];
const generateVisible = ref(false);
const generatingRow = ref<ContentArticleSummary | null>(null);
function canGenerate(rows: ContentArticleSummary[]) {
  return rows.length === 1 && !isActiveTask(rows[0]?.latestTask);
}
function openGenerate(rows: ContentArticleSummary[]) {
  if (!user.hasPermission('ContentArticle.update')) return;
  if (rows.length !== 1) {
    ElMessage.warning('请选中一篇文章后生成');
    return;
  }
  if (!canGenerate(rows)) return;
  generatingRow.value = rows[0]!;
  generateVisible.value = true;
}
function submitted() {
  tableRef.value?.clearSelection();
  void tableRef.value?.refresh().catch(() => undefined);
}
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
  <PageContainer title="文章创作">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchArticles"
      :check-able="true"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      perm-module="contentArticle"
      :action-width="260"
      @view="handleView"
      @edit="handleEdit"
    >
      <template #toolbar="{ selectedRows }">
        <Button
          perm="ContentArticle.read"
          icon="Refresh"
          @click="tableRef?.refresh()"
          >刷新</Button
        >
        <Button perm="ContentArticle.create" @click="openCreate"
          >记录想法</Button
        >
        <Button
          perm="ContentArticle.update"
          icon="MagicStick"
          :disabled="!canGenerate(selectedRows)"
          title="选中一篇文章，选择模板与 AI 配置后生成"
          @click="openGenerate(selectedRows)"
          >AI 生成</Button
        >
        <Button
          perm="ContentArticle.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
          >批量删除</Button
        >
      </template>
      <template #actions="{ row }">
        <Button
          perm="ContentArticle.update"
          link
          :auto-icon="false"
          :disabled="isActiveTask(row.latestTask)"
          @click="openGenerate([row])"
          >AI 生成</Button
        >
      </template>
      <template #column-latestTask="{ row }"
        ><el-tag
          v-if="row.latestTask"
          :type="taskColor(row.latestTask.status)"
          >{{ taskLabel(row.latestTask.status) }}</el-tag
        ><span v-else>未生成</span></template
      >
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
    <Generate
      v-model:visible="generateVisible"
      :row="generatingRow"
      @submitted="submitted"
    />
    <Edit
      v-model:visible="editVisible"
      :row="editingRow"
      @success="tableRef?.refresh()"
    />
    <View
      v-model:visible="viewVisible"
      :row="viewingRow"
      @success="tableRef?.refresh()"
    />
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
