<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import Dialog from '@/components/Dialog.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import { formatDateTime } from '@/utils/format';
import type { HotRunWithSearchResponses } from '@/api/hotTopicDiagnostics';
import SearchResponse from './SearchResponse.vue';
import {
  getHotRuns,
  getHotRun,
  activeRun,
  runStatusLabels,
  type HotRun,
} from '@/api/hotTopic';
const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ runId?: number | null }>();
const emit = defineEmits<{ completed: [] }>();
const tableRef = ref<{ refresh: () => Promise<void> }>();
const selected = ref<number | null>(null),
  detail = ref<HotRunWithSearchResponses | null>(null);
const responseVisible = ref(false);
const responseSelection = ref<{
  runId: number;
  sourceIndex: number;
  sourceName: string;
} | null>(null);
const detailFailed = ref(false),
  listFailed = ref(false);
let epoch = 0,
  detailSequence = 0;
let listTimer: ReturnType<typeof setTimeout> | undefined;
let detailTimer: ReturnType<typeof setTimeout> | undefined;
const columns: TableColumn[] = [
  { prop: 'id', label: '任务', width: 85 },
  { prop: 'action', label: '操作', width: 110, slot: true },
  { prop: 'trigger', label: '触发方式', width: 100, slot: true },
  { prop: 'status', label: '状态', width: 110, slot: true },
  { prop: 'topicCount', label: '选题数', width: 90 },
  { prop: 'errorMessage', label: '错误说明', minWidth: 220 },
  { prop: 'createdAt', label: '提交时间', width: 180, slot: true },
];
async function fetchRuns(params: { page?: number; pageSize?: number }) {
  clearTimeout(listTimer);
  const current = epoch;
  try {
    const result = await getHotRuns(params, true);
    if (current === epoch && visible.value) {
      listFailed.value = false;
      if (result.list.some((item) => activeRun(item.status)))
        listTimer = setTimeout(() => {
          void tableRef.value?.refresh().catch(() => undefined);
        }, 4000);
    }
    return result;
  } catch (error) {
    if (current === epoch) listFailed.value = true;
    throw error;
  }
}
async function loadDetail(id: number) {
  clearTimeout(detailTimer);
  if (selected.value !== id) closeSearchResponse();
  const current = epoch,
    sequence = ++detailSequence;
  selected.value = id;
  try {
    const result = await getHotRun(id, true);
    if (!visible.value || current !== epoch || sequence !== detailSequence)
      return;
    const previouslyActive = detail.value && activeRun(detail.value.status);
    detail.value = result;
    detailFailed.value = false;
    if (activeRun(result.status))
      detailTimer = setTimeout(() => void loadDetail(id), 3000);
    else if (previouslyActive) {
      emit('completed');
      void tableRef.value?.refresh().catch(() => undefined);
    }
  } catch {
    if (current === epoch && sequence === detailSequence) {
      detail.value = null;
      detailFailed.value = true;
    }
  }
}
function view(row: HotRun) {
  detail.value = null;
  void loadDetail(row.id);
}
function showSearchResponse(sourceIndex: number) {
  const source = detail.value?.sources?.[sourceIndex];
  if (!visible.value || !detail.value || !source?.hasSearchResponse) return;
  responseSelection.value = {
    runId: detail.value.id,
    sourceIndex,
    sourceName: source.sourceName,
  };
  responseVisible.value = true;
}
function closeSearchResponse() {
  responseVisible.value = false;
  responseSelection.value = null;
}
function stop() {
  ++epoch;
  ++detailSequence;
  clearTimeout(listTimer);
  clearTimeout(detailTimer);
  closeSearchResponse();
}
watch(
  () => [visible.value, props.runId] as const,
  ([open]) => {
    stop();
    detail.value = null;
    selected.value = null;
    detailFailed.value = false;
    listFailed.value = false;
    if (open && props.runId) void loadDetail(props.runId);
  },
);
onBeforeUnmount(stop);
</script>
<template>
  <Dialog
    v-model="visible"
    title="热点获取与推荐记录"
    width="1060px"
    :show-footer="false"
  >
    <p class="hint">
      关闭窗口只停止前端查询，不会取消后台执行；失败与部分完成可查看各来源的具体说明。
    </p>
    <section v-if="selected" class="run-detail">
      <h3>任务 #{{ selected }}</h3>
      <p v-if="detailFailed" class="error">
        详情读取失败，已停止轮询。<Button @click="loadDetail(selected!)"
          >重新读取</Button
        >
      </p>
      <template v-else-if="detail">
        <p>
          {{ runStatusLabels[detail.status] }} ·
          {{ detail.message || detail.stage || '暂无阶段说明' }}
        </p>
        <p v-if="detail.errorMessage" class="error">
          {{ detail.errorMessage }}
        </p>
        <p class="hint">
          候选 {{ detail.candidateCount ?? 0 }} 条 · 选题
          {{ detail.topicCount ?? 0 }} 条 ·
          {{
            detail.searchExecuted
              ? '本次已执行联网搜索'
              : '本次未确认执行联网搜索'
          }}<template v-if="detail.totalTokens != null">
            · {{ detail.totalTokens }} tokens</template
          >
        </p>
        <ul>
          <li v-for="(source, index) in detail.sources || []" :key="index">
            {{ source.sourceName }}：{{
              source.status === 'succeeded'
                ? '完成'
                : source.status === 'skipped'
                  ? '已跳过'
                  : '失败'
            }}
            · {{ source.count }} 条 · {{ source.message }}
            <Button
              v-if="source.hasSearchResponse"
              perm="HotTopic.read"
              link
              :confirm="false"
              @click="showSearchResponse(index)"
              >查看联网响应</Button
            >
          </li>
        </ul>
        <p
          v-if="
            detail.action === 'discover' &&
            !activeRun(detail.status) &&
            !detail.sources?.some((source) => source.hasSearchResponse)
          "
          class="hint"
        >
          此任务没有已保存的联网响应；历史任务或未发起联网请求的任务无法补看接口返回。
        </p>
      </template>
      <p v-else>正在读取任务详情…</p>
    </section>
    <p v-if="listFailed" class="error">
      记录读取失败。<Button @click="tableRef?.refresh()">重新读取</Button>
    </p>
    <Table
      v-if="visible"
      ref="tableRef"
      :columns="columns"
      :request="fetchRuns"
      perm-module="hotTopic"
      :show-edit="false"
      :show-delete="false"
      :action-width="80"
      @view="view"
    >
      <template #column-action="{ row }">{{
        row.action === 'recommend' ? '重新推荐' : '获取热点'
      }}</template>
      <template #column-trigger="{ row }">{{
        row.trigger === 'schedule' ? '每日计划' : '手动'
      }}</template>
      <template #column-status="{ row }">{{
        runStatusLabels[row.status as keyof typeof runStatusLabels]
      }}</template>
      <template #column-createdAt="{ row }">{{
        formatDateTime(row.createdAt)
      }}</template>
    </Table>
    <template #footer><Button @click="visible = false">关闭</Button></template>
  </Dialog>
  <SearchResponse
    v-if="visible && responseSelection"
    v-model:visible="responseVisible"
    :run-id="responseSelection.runId"
    :source-index="responseSelection.sourceIndex"
    :source-name="responseSelection.sourceName"
  />
</template>
<style scoped>
.hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.7;
}
.error {
  color: var(--el-color-danger);
}
.run-detail {
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 20px;
  padding-bottom: 12px;
  overflow-wrap: anywhere;
  line-height: 1.8;
}
h3 {
  font-size: 16px;
}
</style>
