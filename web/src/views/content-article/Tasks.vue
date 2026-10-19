<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import Table, { type TableColumn } from '@/components/Table.vue';
import Button from '@/components/Button.vue';
import {
  getContentTasks,
  getContentTask,
  adoptContentTask,
  type ContentArticle,
  type ContentTask,
  type ContentTaskDetail,
} from '@/api/contentArticle';
import { formatDateTime } from '@/utils/format';
import { isActiveTask, taskLabel, taskColor, taskElapsed } from './taskState';

const props = defineProps<{
  articleId: number;
  version: number;
  canAdopt?: boolean;
  revision?: number;
}>();
const emit = defineEmits<{
  adopted: [article: ContentArticle];
  active: [value: boolean];
  busy: [value: boolean];
}>();
const tableRef = ref<{ refresh: () => Promise<void> }>();
const detail = ref<ContentTaskDetail | null>(null);
const loadingDetail = ref(false);
const adopting = ref(false);
const pollFailed = ref(false);
const now = ref(Date.now());
let alive = true;
let detailSequence = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let requestSequence = 0;
const columns: TableColumn[] = [
  { prop: 'id', label: '任务', width: 80 },
  { prop: 'status', label: '状态', width: 100, slot: true },
  { prop: 'elapsed', label: '耗时', width: 100, slot: true },
  { prop: 'createdAt', label: '提交时间', minWidth: 180, slot: true },
];
async function fetchTasks(params: { page?: number; pageSize?: number }) {
  clearTimeout(timer);
  const sequence = ++requestSequence;
  try {
    const result = await getContentTasks(props.articleId, params, true);
    if (!alive || sequence !== requestSequence) return result;
    pollFailed.value = false;
    now.value = Date.now();
    const active = result.list.some(isActiveTask);
    if ((params.page ?? 1) === 1) emit('active', active);
    const current = result.list.find((row) => row.id === detail.value?.id);
    if (current && detail.value && current.status !== detail.value.status) {
      await showDetail(current);
    }
    if (alive && active)
      timer = setTimeout(() => {
        void tableRef.value?.refresh().catch(() => undefined);
      }, 3000);
    return result;
  } catch (error) {
    if (alive) pollFailed.value = true;
    throw error;
  }
}
async function showDetail(row: ContentTask) {
  const sequence = ++detailSequence;
  loadingDetail.value = true;
  try {
    const result = await getContentTask(row.id);
    if (alive && sequence === detailSequence) detail.value = result;
  } catch {
    /* 保留记录列表；请求层显示错误。 */
  } finally {
    if (alive && sequence === detailSequence) loadingDetail.value = false;
  }
}
async function adopt() {
  if (
    !detail.value ||
    adopting.value ||
    !props.canAdopt ||
    detail.value.status !== 'succeeded' ||
    detail.value.articleVersion !== props.version
  )
    return;
  const taskId = detail.value.id;
  adopting.value = true;
  emit('busy', true);
  try {
    const result = await adoptContentTask(taskId, props.version);
    if (!alive) return;
    if (detail.value?.id === taskId) detail.value.status = 'adopted';
    emit('adopted', result);
    ElMessage.success('正文已采用并保存');
    await tableRef.value?.refresh();
  } catch {
    /* 冲突时保留候选正文，允许复制后手工合并。 */
  } finally {
    adopting.value = false;
    emit('busy', false);
  }
}
async function copyResult() {
  if (!detail.value?.result) return;
  try {
    await navigator.clipboard.writeText(detail.value.result);
    ElMessage.success('候选正文已复制');
  } catch {
    ElMessage.warning('复制失败，请选中正文手动复制');
  }
}
watch(
  () => props.revision,
  () => {
    void tableRef.value?.refresh();
  },
);
onBeforeUnmount(() => {
  alive = false;
  ++detailSequence;
  ++requestSequence;
  clearTimeout(timer);
});
</script>
<template>
  <section class="generation-records">
    <div class="generation-records__heading">
      <h3>生成记录</h3>
      <Button
        perm="ContentArticle.read"
        icon="Refresh"
        @click="tableRef?.refresh()"
        >刷新</Button
      >
    </div>
    <el-alert
      v-if="pollFailed"
      title="进度读取失败，任务仍在后台执行；请手动刷新"
      :closable="false"
    />
    <Table
      ref="tableRef"
      :columns="columns"
      :request="fetchTasks"
      :show-edit="false"
      :show-delete="false"
      perm-module="contentArticle"
      action-width="90"
      @view="showDetail"
    >
      <template #column-status="{ row }"
        ><el-tag :type="taskColor(row.status)">{{
          taskLabel(row.status)
        }}</el-tag></template
      >
      <template #column-elapsed="{ row }">{{ taskElapsed(row, now) }}</template>
      <template #column-createdAt="{ row }">{{
        formatDateTime(row.createdAt)
      }}</template>
    </Table>
    <section
      v-if="detail"
      v-loading="loadingDetail"
      class="generation-records__detail"
    >
      <div class="generation-records__heading">
        <strong>任务 #{{ detail.id }} · {{ taskLabel(detail.status) }}</strong>
        <Button :disabled="adopting" @click="detail = null">收起</Button>
      </div>
      <p>
        提交：{{ formatDateTime(detail.createdAt) }} · 耗时：{{
          taskElapsed(detail, now)
        }}<span v-if="detail.totalTokens !== null">
          · {{ detail.totalTokens }} tokens</span
        >
      </p>
      <p>
        {{ detail.snapshot.config.name }} · {{ detail.snapshot.config.model }} ·
        {{ detail.snapshot.template.name }}
      </p>
      <p v-if="isActiveTask(detail)" role="status">
        {{
          detail.status === 'pending'
            ? '等待执行，可关闭页面稍后查看'
            : '模型正在生成正文，可关闭页面稍后查看'
        }}
      </p>
      <p v-if="detail.errorMessage" role="alert">{{ detail.errorMessage }}</p>
      <details>
        <summary>生成时的素材与模板</summary>
        <p>{{ detail.snapshot.title }}</p>
        <pre>{{ detail.snapshot.idea }}</pre>
        <pre>{{ detail.snapshot.template.instruction || '通用写作' }}</pre>
      </details>
      <template v-if="detail.result">
        <div class="generation-records__heading">
          <Button @click="copyResult">复制候选正文</Button>
          <Button
            v-if="detail.status === 'succeeded'"
            perm="ContentArticle.update"
            :disabled="
              !canAdopt || detail.articleVersion !== version || adopting
            "
            :loading="adopting"
            confirm
            confirm-text="采用后将替换文章正文并立即保存，确认采用？"
            @click="adopt"
            >采用并保存</Button
          >
        </div>
        <p
          v-if="
            detail.status === 'succeeded' &&
            (!canAdopt || detail.articleVersion !== version)
          "
        >
          文章有修改时请复制候选正文，手动合并后保存。
        </p>
        <pre class="generation-records__result">{{ detail.result }}</pre>
      </template>
    </section>
  </section>
</template>
<style scoped>
.generation-records {
  margin-top: 20px;
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
.generation-records__heading h3 {
  margin: 0;
  font-size: 16px;
}
.generation-records__detail {
  margin-top: 16px;
  border: 1px solid #b3d8ff;
  border-radius: 8px;
  padding: 16px;
  background: #f5f9ff;
  overflow-wrap: anywhere;
}
.generation-records pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  line-height: 1.8;
  max-height: 420px;
  overflow: auto;
}
.generation-records summary {
  cursor: pointer;
}
.generation-records__result {
  background: #fff;
  border: 1px solid #dce3ed;
  padding: 12px;
  border-radius: 6px;
}
</style>
