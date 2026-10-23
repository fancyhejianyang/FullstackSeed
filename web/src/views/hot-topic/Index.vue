<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useSubmissionGuard } from './submissionGuard';
import { ElMessage } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import Button from '@/components/Button.vue';
import type { FormField } from '@/components/Form.vue';
import { useUserStore } from '@/stores/user';
import { formatDateTime } from '@/utils/format';
import {
  getHotTopics,
  startHotRun,
  updateHotDecision,
  decisionLabels,
  levelLabels,
  type HotTopicSummary,
  type HotTopicDecision,
} from '@/api/hotTopic';
import Preferences from './Preferences.vue';
import View from './View.vue';
import Runs from './Runs.vue';
import CreateArticle from './CreateArticle.vue';
const user = useUserStore();
const tableRef = ref<{ refresh: () => Promise<void> }>();
const preferenceVisible = ref(false),
  detailVisible = ref(false),
  runsVisible = ref(false),
  createVisible = ref(false);
const selected = ref<HotTopicSummary | null>(null);
const latestRunId = ref<number | null>(null);
const submitting = ref(false),
  updatingId = ref<number | null>(null);
let alive = true;
const pending = new Map<
  'discover' | 'recommend',
  { action: 'discover' | 'recommend'; requestId: string }
>();
const columns: TableColumn[] = [
  { prop: 'title', label: '热点主题', minWidth: 260 },
  { prop: 'sourceName', label: '来源', minWidth: 150 },
  { prop: 'rank', label: '来源排名', width: 100, slot: true },
  { prop: 'recommendationLevel', label: 'AI 推荐', width: 120, slot: true },
  { prop: 'reason', label: '推荐理由', minWidth: 260 },
  { prop: 'decision', label: '我的状态', width: 120, slot: true },
  { prop: 'fetchedAt', label: '获取时间', width: 180, slot: true },
];
const searchFields: FormField[] = [
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '热点主题' },
  {
    prop: 'level',
    label: '推荐程度',
    type: 'select',
    options: [
      { value: '', label: '全部' },
      ...Object.entries(levelLabels).map(([value, label]) => ({
        value,
        label,
      })),
    ],
  },
  {
    prop: 'decision',
    label: '我的状态',
    type: 'select',
    options: [
      { value: '', label: '全部' },
      ...Object.entries(decisionLabels).map(([value, label]) => ({
        value,
        label,
      })),
    ],
  },
];
function view(row: HotTopicSummary) {
  selected.value = row;
  detailVisible.value = true;
}
function create(row: HotTopicSummary) {
  selected.value = row;
  createVisible.value = true;
}
function refresh() {
  void tableRef.value?.refresh().catch(() => undefined);
}
async function run(action: 'discover' | 'recommend') {
  if (submitting.value) return;
  if (!pending.has(action))
    pending.set(action, { action, requestId: crypto.randomUUID() });
  submitting.value = true;
  try {
    const result = await startHotRun(pending.get(action)!);
    pending.delete(action);
    if (!alive) return;
    latestRunId.value = result.id;
    runsVisible.value = true;
    ElMessage.success('已提交后台任务，可在获取记录中查看结果');
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response
      ?.status;
    if (
      status &&
      status >= 400 &&
      status < 500 &&
      status !== 408 &&
      status !== 429
    )
      pending.delete(action);
  } finally {
    submitting.value = false;
  }
}
async function decide(
  row: HotTopicSummary,
  decision: Exclude<HotTopicDecision, 'selected'>,
) {
  if (updatingId.value !== null) return;
  updatingId.value = row.id;
  try {
    await updateHotDecision(row.id, decision);
    if (alive) refresh();
  } catch {
    /* The request interceptor displays the server error. */
  } finally {
    updatingId.value = null;
  }
}
useSubmissionGuard(() => submitting.value || updatingId.value !== null);
onBeforeUnmount(() => {
  alive = false;
});
</script>
<template>
  <PageContainer title="热点选题">
    <p class="topic-intro">
      按你的兴趣获取各平台热点与热搜线索，由 AI
      提供创作建议。先设置偏好，再手动获取或启用每日计划；选题仍由你决定，不会自动生成或发布文章。
    </p>
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="getHotTopics"
      perm-module="hotTopic"
      :show-edit="false"
      :show-delete="false"
      :action-width="180"
      @view="view"
    >
      <template #toolbar>
        <Button
          perm="HotTopic.create"
          icon="Search"
          :loading="submitting"
          confirm
          confirm-text="按已保存的偏好获取热点并生成推荐，可能产生 AI 或数据接口费用。是否继续？"
          @click="run('discover')"
          >获取热点</Button
        >
        <Button
          perm="HotTopic.create"
          :disabled="submitting"
          confirm
          confirm-text="使用当前偏好重新分析已有热点，不重新获取网页；可能产生 AI 费用。是否继续？"
          @click="run('recommend')"
          >重新推荐</Button
        >
        <Button
          perm="HotTopic.update"
          icon="Setting"
          :disabled="submitting"
          @click="preferenceVisible = true"
          >偏好与计划</Button
        >
        <Button perm="HotTopic.read" icon="Clock" @click="runsVisible = true"
          >获取记录</Button
        >
      </template>
      <template #column-rank="{ row }">{{ row.rank ?? '—' }}</template>
      <template #column-recommendationLevel="{ row }">{{
        levelLabels[row.recommendationLevel as keyof typeof levelLabels] ||
        '未 AI 推荐'
      }}</template>
      <template #column-decision="{ row }">{{
        decisionLabels[row.decision as keyof typeof decisionLabels] || '未处理'
      }}</template>
      <template #column-fetchedAt="{ row }">{{
        formatDateTime(row.fetchedAt)
      }}</template>
      <template #actions="{ row }">
        <Button
          v-if="
            user.hasPermission('ContentArticle.create') &&
            row.decision !== 'selected'
          "
          perm="HotTopic.create"
          link
          :disabled="submitting"
          @click="create(row)"
          >选取创作</Button
        >
        <Button
          v-if="row.decision !== 'selected'"
          perm="HotTopic.update"
          link
          :icon="row.decision === 'ignored' ? 'RefreshLeft' : 'Hide'"
          :title="row.decision === 'ignored' ? '恢复' : '忽略'"
          :aria-label="row.decision === 'ignored' ? '恢复该热点' : '忽略该热点'"
          :disabled="updatingId !== null"
          @click="decide(row, row.decision === 'ignored' ? 'new' : 'ignored')"
        />
      </template>
    </Table>
    <Preferences v-model:visible="preferenceVisible" />
    <View v-model:visible="detailVisible" :row="selected" />
    <CreateArticle
      v-model:visible="createVisible"
      :row="selected"
      @success="refresh"
    />
    <Runs
      v-model:visible="runsVisible"
      :run-id="latestRunId"
      @completed="refresh"
    />
  </PageContainer>
</template>
<style scoped>
.topic-intro {
  color: var(--el-text-color-regular);
  line-height: 1.8;
  margin: 0 0 20px;
}
:deep(.pro-table__action-column .cell) {
  white-space: nowrap;
}
</style>
