<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import Table, { type TableColumn } from '@/components/Table.vue';
import Button from '@/components/Button.vue';
import Checkbox from '@/components/Checkbox.vue';
import Dialog from '@/components/Dialog.vue';
import CoverPreview from './CoverPreview.vue';
import type { FormField } from '@/components/Form.vue';
import { useUserStore } from '@/stores/user';
import {
  getContentGenerationRecords,
  getContentArticle,
  getContentTask,
  adoptContentTask,
  type ContentArticle,
  type ContentTask,
  type ContentTaskDetail,
  type ContentTaskQuery,
} from '@/api/contentArticle';
import { formatDateTime } from '@/utils/format';
import {
  isActiveTask,
  taskLabel,
  taskColor,
  taskElapsed,
  coverLabels,
} from './taskState';

const props = defineProps<{
  articleId?: number;
}>();
const emit = defineEmits<{
  adopted: [article: ContentArticle];
  active: [value: boolean];
  busy: [value: boolean];
}>();
const tableRef = ref<{ refresh: () => Promise<void> }>();
const user = useUserStore();
const article = ref<ContentArticle | null>(null);
const detailVisible = ref(false);
const selectedId = ref<number | null>(null);
const detail = ref<ContentTaskDetail | null>(null);
const loadingDetail = ref(false);
const hasCandidate = computed(
  () =>
    !!detail.value?.result &&
    ['succeeded', 'adopted'].includes(detail.value.status),
);
const hasGeneratedTitle = computed(
  () => hasCandidate.value && !!detail.value?.generatedTitle?.trim(),
);
const adoptTitle = ref(false);
const adoptCover = ref(false);
const hasCover = computed(
  () =>
    detail.value?.coverStatus === 'succeeded' && !!detail.value.coverData?.url,
);
const adoptConfirmation = computed(() =>
  adoptCover.value && hasCover.value
    ? `采用后将替换文章${adoptTitle.value && hasGeneratedTitle.value ? '标题、' : ''}正文及封面并立即保存，确认采用？`
    : adoptTitle.value && hasGeneratedTitle.value
      ? '采用后将替换文章标题与正文并立即保存，确认采用？'
      : '采用后将替换文章正文并立即保存，确认采用？',
);
const adopting = ref(false);
const pollFailed = ref(false);
const now = ref(Date.now());
let alive = true;
let detailSequence = 0;
let detailReadFailed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let requestSequence = 0;
let lastListResponse: Awaited<
  ReturnType<typeof getContentGenerationRecords>
> | null = null;
const columns: TableColumn[] = [
  { prop: 'id', label: '任务', width: 80 },
  { prop: 'articleTitle', label: '文章标题', minWidth: 260 },
  { prop: 'status', label: '状态', width: 100, slot: true },
  { prop: 'coverStatus', label: '封面', width: 120, slot: true },
  { prop: 'elapsed', label: '耗时', width: 100, slot: true },
  { prop: 'createdAt', label: '提交时间', minWidth: 180, slot: true },
];
const searchFields: FormField[] = [
  {
    prop: 'keyword',
    label: '文章标题',
    type: 'input',
    placeholder: '搜索文章标题',
  },
  {
    prop: 'status',
    label: '生成状态',
    type: 'select',
    options: [
      { label: '全部', value: '' },
      ...(
        [
          'pending',
          'running',
          'succeeded',
          'needs_input',
          'failed',
          'interrupted',
          'adopted',
        ] as const
      ).map((value) => ({ label: taskLabel(value), value })),
    ],
  },
];
async function fetchTasks(params: ContentTaskQuery) {
  clearTimeout(timer);
  const sequence = ++requestSequence;
  lastListResponse = null;
  try {
    const result = await getContentGenerationRecords(
      {
        ...params,
        status: params.status || undefined,
        articleId: props.articleId,
      },
      true,
    );
    if (!alive || sequence !== requestSequence)
      return lastListResponse ?? { list: [], total: 0 };
    lastListResponse = result;
    pollFailed.value = false;
    now.value = Date.now();
    const active = result.list.some(isActiveTask);
    if ((params.page ?? 1) === 1) emit('active', active);
    if (detailVisible.value && selectedId.value && !adopting.value) {
      await showDetail({ id: selectedId.value }, true);
    }
    if (
      alive &&
      sequence === requestSequence &&
      !detailReadFailed &&
      (active || isActiveTask(detail.value))
    ) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void tableRef.value?.refresh().catch(() => undefined);
      }, 3000);
    }
    return lastListResponse ?? { list: [], total: 0 };
  } catch (error) {
    if (alive && sequence === requestSequence) {
      pollFailed.value = true;
      // 读取失败不得继续把上一次结果显示为最新。
      ++detailSequence;
      detail.value = null;
      article.value = null;
      loadingDetail.value = false;
    }
    throw error;
  }
}
async function showDetail(row: Pick<ContentTask, 'id'>, silent = false) {
  if (adopting.value) return;
  const initializeTitle =
    !detailVisible.value ||
    selectedId.value !== row.id ||
    !detail.value?.generatedTitle;
  const sequence = ++detailSequence;
  detailReadFailed = false;
  selectedId.value = row.id;
  detailVisible.value = true;
  loadingDetail.value = true;
  if (!silent || detail.value?.id !== row.id) {
    adoptCover.value = false;
    detail.value = null;
    article.value = null;
  }
  try {
    const result = await getContentTask(row.id, silent);
    if (!alive || sequence !== detailSequence) return;
    const currentArticle = await getContentArticle(result.articleId, silent);
    if (alive && sequence === detailSequence) {
      detail.value = result;
      article.value = currentArticle;
      if (initializeTitle) adoptTitle.value = hasGeneratedTitle.value;
      if (!hasGeneratedTitle.value) adoptTitle.value = false;
      if (isActiveTask(result)) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          void tableRef.value?.refresh().catch(() => undefined);
        }, 3000);
      }
    }
  } catch {
    /* 请求层显示错误；详情保持为空，避免误读旧稿。 */
    if (alive && sequence === detailSequence) {
      detailReadFailed = true;
      detail.value = null;
      article.value = null;
      clearTimeout(timer);
    }
  } finally {
    if (alive && sequence === detailSequence) loadingDetail.value = false;
  }
}
async function adopt() {
  if (
    !detail.value ||
    !hasCandidate.value ||
    adopting.value ||
    !user.hasPermission('ContentArticle.update') ||
    loadingDetail.value ||
    detail.value.status !== 'succeeded' ||
    isActiveTask(detail.value) ||
    detail.value.articleVersion !== article.value?.version
  )
    return;
  const taskId = detail.value.id;
  adopting.value = true;
  emit('busy', true);
  try {
    const result = await adoptContentTask(
      taskId,
      article.value!.version,
      adoptTitle.value && hasGeneratedTitle.value,
      adoptCover.value && hasCover.value,
    );
    if (!alive) return;
    if (detail.value?.id === taskId) detail.value.status = 'adopted';
    article.value = result;
    emit('adopted', result);
    ElMessage.success('已采用并保存');
    await tableRef.value?.refresh();
  } catch {
    /* 冲突时保留候选正文，允许复制后手工合并。 */
  } finally {
    adopting.value = false;
    emit('busy', false);
  }
}
async function copyResult() {
  if (!hasCandidate.value || !detail.value?.result || loadingDetail.value)
    return;
  try {
    await navigator.clipboard.writeText(detail.value.result);
    ElMessage.success('候选正文已复制');
  } catch {
    ElMessage.warning('复制失败，请选中正文手动复制');
  }
}
async function copyTitle() {
  if (!hasGeneratedTitle.value || loadingDetail.value) return;
  try {
    await navigator.clipboard.writeText(detail.value!.generatedTitle!);
    ElMessage.success('生成标题已复制');
  } catch {
    ElMessage.warning('复制失败，请选中标题手动复制');
  }
}
function closeDetail() {
  if (adopting.value) return;
  ++detailSequence;
  detailReadFailed = false;
  adoptTitle.value = false;
  adoptCover.value = false;
  selectedId.value = null;
  detail.value = null;
  article.value = null;
  loadingDetail.value = false;
  detailVisible.value = false;
}
function beforeClose(done: () => void) {
  if (adopting.value) return;
  closeDetail();
  done();
}
watch(detailVisible, (open) => {
  if (!open) closeDetail();
});
onBeforeRouteLeave(() => !adopting.value);
onBeforeRouteUpdate(() => !adopting.value);
function beforeUnload(event: BeforeUnloadEvent) {
  if (!adopting.value) return;
  event.preventDefault();
  event.returnValue = '';
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload);
  alive = false;
  ++detailSequence;
  ++requestSequence;
  clearTimeout(timer);
});
</script>
<template>
  <section class="generation-records">
    <el-alert
      v-if="pollFailed"
      title="生成记录读取失败，请手动刷新；不会重新提交生成任务"
      :closable="false"
    />
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchTasks"
      :show-edit="false"
      :show-delete="false"
      perm-module="contentArticle"
      action-width="90"
      @view="showDetail"
    >
      <template #toolbar>
        <Button
          perm="ContentArticle.read"
          icon="Refresh"
          @click="tableRef?.refresh()"
          >刷新</Button
        >
      </template>
      <template #column-status="{ row }"
        ><el-tag :type="taskColor(row.status)">{{
          taskLabel(row.status, row.coverStatus)
        }}</el-tag></template
      >
      <template #column-coverStatus="{ row }">{{
        coverLabels[row.coverStatus] || '—'
      }}</template>
      <template #column-elapsed="{ row }">{{ taskElapsed(row, now) }}</template>
      <template #column-createdAt="{ row }">{{
        formatDateTime(row.createdAt)
      }}</template>
    </Table>
    <Dialog
      v-model="detailVisible"
      title="生成详情"
      width="min(1000px, 94vw)"
      :show-footer="false"
      :before-close="beforeClose"
    >
      <div v-loading="loadingDetail" class="generation-records__detail">
        <template v-if="detail">
          <h3>{{ article?.title || detail.snapshot.title }}</h3>
          <div class="generation-records__heading">
            <strong
              >任务 #{{ detail.id }} · {{ taskLabel(detail.status) }}</strong
            >
          </div>
          <p>
            提交：{{ formatDateTime(detail.createdAt) }} · 耗时：{{
              taskElapsed(detail, now)
            }}<span v-if="detail.totalTokens !== null">
              · {{ detail.totalTokens }} tokens</span
            >
          </p>
          <p>
            {{ detail.snapshot.config.name }} ·
            {{ detail.snapshot.config.model }} ·
            {{ detail.snapshot.template.name }} ·
            {{
              detail.snapshot.config.responseFormat === 'text'
                ? '纯文本'
                : 'Markdown'
            }}
          </p>
          <p
            v-if="detail.status === 'pending' || detail.status === 'running'"
            role="status"
          >
            {{
              detail.status === 'pending'
                ? '等待执行，可关闭页面稍后查看'
                : '模型正在生成正文，可关闭页面稍后查看'
            }}
          </p>
          <p v-if="detail.errorMessage" role="alert">
            {{ detail.errorMessage }}
          </p>
          <section
            v-if="detail.editorNotes?.length"
            class="generation-records__notes"
            aria-label="编辑提示"
          >
            <strong>{{
              detail.status === 'needs_input'
                ? '需要补充的素材'
                : '编辑提示（不属于正文）'
            }}</strong>
            <ul>
              <li v-for="(note, index) in detail.editorNotes" :key="index">
                {{ note }}
              </li>
            </ul>
          </section>
          <p v-if="detail.status === 'needs_input'" role="status">
            本次未生成正文，请在文章“编辑 →
            想法”中补充并保存，再从列表重新发起生成。该任务不会自动重试。
          </p>
          <details>
            <summary>生成时的素材与模板</summary>
            <p>{{ detail.snapshot.title }}</p>
            <pre>{{ detail.snapshot.idea }}</pre>
            <pre>{{ detail.snapshot.template.instruction || '通用写作' }}</pre>
          </details>
          <template v-if="hasCandidate">
            <CoverPreview :task="detail" />
            <div v-if="hasGeneratedTitle" class="generation-records__title">
              <span>生成标题</span>
              <h3>{{ detail.generatedTitle }}</h3>
            </div>
            <p v-else>该历史记录未生成标题，采用正文时保留原标题。</p>
            <div class="generation-records__heading">
              <Button
                v-if="hasGeneratedTitle"
                :disabled="loadingDetail"
                @click="copyTitle"
                >复制生成标题</Button
              >
              <Button @click="copyResult">复制候选正文</Button>
              <Checkbox
                v-if="
                  hasGeneratedTitle &&
                  detail.status === 'succeeded' &&
                  user.hasPermission('ContentArticle.update')
                "
                v-model="adoptTitle"
                :disabled="adopting || loadingDetail"
                label="同时采用生成标题"
              />
              <Button
                v-if="detail.status === 'succeeded'"
                perm="ContentArticle.update"
                :disabled="
                  detail.articleVersion !== article?.version ||
                  isActiveTask(detail) ||
                  adopting ||
                  loadingDetail
                "
                :loading="adopting"
                confirm
                :confirm-text="adoptConfirmation"
                @click="adopt"
                >采用并保存</Button
              >
              <Checkbox
                v-if="
                  hasCover &&
                  detail.status === 'succeeded' &&
                  user.hasPermission('ContentArticle.update')
                "
                v-model="adoptCover"
                :disabled="adopting || loadingDetail || isActiveTask(detail)"
                label="同时采用生成封面"
              />
            </div>
            <p
              v-if="
                detail.status === 'succeeded' &&
                detail.articleVersion !== article?.version
              "
            >
              文章有修改时请复制候选正文，手动合并后保存。
            </p>
            <pre class="generation-records__result">{{ detail.result }}</pre>
          </template>
        </template>
        <el-empty
          v-else-if="!loadingDetail"
          description="详情读取失败，请刷新重试"
        />
      </div>
      <template #footer>
        <Button
          v-if="selectedId"
          perm="ContentArticle.read"
          icon="Refresh"
          :disabled="adopting || loadingDetail"
          @click="showDetail({ id: selectedId })"
          >刷新</Button
        >
        <Button :disabled="adopting" @click="closeDetail">关闭</Button>
      </template>
    </Dialog>
  </section>
</template>
<style scoped>
.generation-records {
  min-width: 0;
  color: #303133;
}
.generation-records__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 0;
}
.generation-records__detail h3 {
  margin: 0;
  font-size: 16px;
}
.generation-records__detail {
  color: #303133;
  min-height: 120px;
  margin-top: 16px;
  border: 1px solid #b3d8ff;
  border-radius: 8px;
  padding: 16px;
  background: #f5f9ff;
  overflow-wrap: anywhere;
}
.generation-records__detail pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  line-height: 1.8;
  max-height: 420px;
  overflow: auto;
}
.generation-records__detail summary {
  cursor: pointer;
}
.generation-records__notes {
  padding: 12px;
  margin: 12px 0;
  background: #fff;
  border: 1px solid #dce3ed;
  border-radius: 6px;
}
.generation-records__notes li {
  margin-top: 6px;
  white-space: pre-wrap;
  line-height: 1.7;
}
.generation-records__result {
  background: #fff;
  border: 1px solid #dce3ed;
  padding: 12px;
  border-radius: 6px;
}
.generation-records__title {
  padding: 12px;
  margin-top: 16px;
  background: #fff;
  border: 1px solid #dce3ed;
  border-radius: 6px;
}
.generation-records__title span {
  display: block;
  margin-bottom: 8px;
  color: #606266;
}
</style>
