<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
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
  getContentArticle,
  deleteContentArticle,
  batchDeleteContentArticles,
  type ContentArticleSummary,
} from '@/api/contentArticle';
import Generate from './Generate.vue';
import Edit from './Edit.vue';
import View from './View.vue';
import { createGenerationSubmitter } from './generationRequest';

const user = useUserStore();
const router = useRouter();
function openRecords(articleId?: number) {
  viewVisible.value = false;
  void router.push({
    path: '/content-generation',
    query: articleId ? { articleId } : {},
  });
}
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
const generatingId = ref<number | null>(null);
const submitSaved = createGenerationSubmitter();
function canGenerate(rows: ContentArticleSummary[]) {
  return (
    generatingId.value === null &&
    !generateVisible.value &&
    rows.length === 1 &&
    !isActiveTask(rows[0]?.latestTask)
  );
}
async function openGenerate(rows: ContentArticleSummary[]) {
  if (!user.hasPermission('ContentArticle.update')) return;
  if (rows.length !== 1) {
    ElMessage.warning('请选中一篇文章后生成');
    return;
  }
  if (!canGenerate(rows)) return;
  const row = rows[0]!;
  generatingId.value = row.id;
  try {
    const accepted = await submitSaved(row.id, async () => {
      const article = await getContentArticle(row.id);
      if (!alive) return null;
      if (!article.aiConfigId) {
        generatingRow.value = row;
        generateVisible.value = true;
        return null;
      }
      if (!article.idea.trim()) {
        ElMessage.warning('请先编辑文章，填写并保存想法');
        return null;
      }
      if (article.templateId && !user.hasPermission('ContentTemplate.read')) {
        ElMessage.warning(
          '无权使用已保存的写作模板，请在编辑中清除或联系管理员',
        );
        return null;
      }
      return {
        version: article.version,
        aiConfigId: article.aiConfigId,
        templateId: article.templateId ?? undefined,
      };
    });
    if (accepted && alive) {
      ElMessage.success('已提交后台生成，可在“内容创作 → 生成记录”查看进度');
      submitted();
    }
  } catch {
    // 后端再次校验配置/模板与版本，不静默更换配置、不自动重试。
    if (alive) void tableRef.value?.refresh().catch(() => undefined);
  } finally {
    generatingId.value = null;
  }
}
function canLeave() {
  if (generatingId.value === null) return true;
  ElMessage.warning('正在提交任务，请稍候');
  return false;
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (generatingId.value !== null) {
    event.preventDefault();
    event.returnValue = '';
  }
}
onBeforeRouteLeave(canLeave);
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
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
      :action-width="340"
      @view="handleView"
      @edit="handleEdit"
    >
      <template #toolbar="{ selectedRows }">
        <Button perm="ContentArticle.read" icon="Tickets" @click="openRecords()"
          >生成记录</Button
        >
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
          :loading="generatingId !== null"
          title="使用已保存的模板与 AI 配置直接生成，调用可能计费；更换设置请编辑文章"
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
          perm="ContentArticle.read"
          link
          :auto-icon="false"
          @click="openRecords(row.id)"
          >生成记录</Button
        >
        <Button
          perm="ContentArticle.update"
          link
          :auto-icon="false"
          :disabled="!canGenerate([row])"
          :loading="generatingId === row.id"
          title="按已保存设置生成，调用可能计费；更换设置请编辑文章"
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
      @records="openRecords"
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
