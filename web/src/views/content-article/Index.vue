<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
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
function listCover(row: ContentArticleSummary) {
  if (row.coverUrl?.trim()) return { url: row.coverUrl, generated: false };
  const task = row.latestTask;
  if (
    task?.status === 'succeeded' &&
    task.coverStatus === 'succeeded' &&
    task.articleVersion === row.version &&
    task.generatedCoverUrl?.trim()
  )
    return { url: task.generatedCoverUrl, generated: true };
  return null;
}
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
  if (!user.hasPermission('ContentArticle.aiGenerate')) return;
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
      ElMessage.success('已提交后台生成，可点击“查看”阅读生成结果');
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
      :action-width="260"
      @view="handleView"
      @edit="handleEdit"
    >
      <template #toolbar="{ selectedRows }">
        <Button perm="ContentArticle.create" @click="openCreate"
          >记录想法</Button
        >
        <Button
          perm="ContentArticle.aiGenerate"
          icon="MagicStick"
          :disabled="!canGenerate(selectedRows)"
          :loading="generatingId !== null"
          title="按已保存设置生成；同账号配置了生图模型时还会生成候选封面，调用可能计费。更换设置请编辑文章"
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
          perm="ContentArticle.aiGenerate"
          link
          :auto-icon="false"
          :disabled="!canGenerate([row])"
          :loading="generatingId === row.id"
          title="按已保存设置生成；同账号配置了生图模型时还会生成候选封面，调用可能计费。更换设置请编辑文章"
          @click="openGenerate([row])"
          >AI 生成</Button
        >
      </template>
      <template #column-latestTask="{ row }"
        ><el-tag
          v-if="row.latestTask"
          :type="taskColor(row.latestTask.status)"
          >{{
            taskLabel(row.latestTask.status, row.latestTask.coverStatus)
          }}</el-tag
        ><span v-else>未生成</span></template
      >
      <template #column-coverUrl="{ row }">
        <div
          v-if="listCover(row)"
          class="article-cover-wrap"
          :title="
            listCover(row)?.generated ? 'AI 候选封面（未采纳）' : '文章封面'
          "
        >
          <el-image
            class="article-cover"
            :src="listCover(row)?.url"
            :alt="
              listCover(row)?.generated ? 'AI 候选封面（未采纳）' : '文章封面'
            "
            fit="cover"
          >
            <template #error
              ><span class="article-cover__error" title="封面加载失败"
                >—</span
              ></template
            >
          </el-image>
          <span
            v-if="listCover(row)?.generated"
            class="article-cover__badge"
            aria-hidden="true"
            >AI</span
          >
        </div>
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
      @adopted="submitted"
    />
  </PageContainer>
</template>

<style scoped>
.article-cover {
  display: block;
  width: 40px;
  height: 40px;
  border-radius: 4px;
}
.article-cover-wrap {
  position: relative;
  width: 40px;
  height: 40px;
}
.article-cover__badge {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 0 3px;
  font-size: 10px;
  line-height: 14px;
  background: #1f5f99;
  color: #fff;
  border-radius: 3px 0 3px 0;
  pointer-events: none;
}
.article-cover__error {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #606266;
  background: #f0f2f5;
}
</style>
