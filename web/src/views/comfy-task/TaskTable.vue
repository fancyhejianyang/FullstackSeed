<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import Table, { type TableColumn } from "@/components/Table.vue";
import Button from "@/components/Button.vue";
import type { FormField } from "@/components/Form.vue";
import { formatDateTime } from "@/utils/format";
import {
  batchDeleteComfyTasks,
  cancelComfyTask,
  deleteComfyTask,
  getComfyTasks,
  retryComfyTask,
  type ComfyTask,
  type ComfyTaskStatus,
} from "@/api/comfyUi";
import View from "./View.vue";

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const viewVisible = ref(false);
const viewingId = ref<number | null>(null);
const cancellingId = ref<number | null>(null);
const retryingId = ref<number | null>(null);
let timer: number | undefined;

const columns: TableColumn[] = [
  { prop: "id", label: "任务", width: 90, slot: true },
  { prop: "workflowName", label: "工作流", minWidth: 180 },
  { prop: "outputType", label: "类型", width: 80, slot: true },
  { prop: "status", label: "状态", width: 110, slot: true },
  {
    prop: "stage",
    label: "阶段 / 失败原因",
    minWidth: 420,
    slot: true,
  },
  { prop: "promptId", label: "ComfyUI Prompt ID", minWidth: 220 },
  { prop: "createdAt", label: "提交时间", width: 180, slot: true },
];
const searchFields: FormField[] = [
  {
    prop: "status",
    label: "任务状态",
    type: "select",
    options: [
      { label: "全部", value: "" },
      { label: "等待执行", value: "pending" },
      { label: "提交中", value: "submitting" },
      { label: "队列中", value: "queued" },
      { label: "执行中", value: "running" },
      { label: "归档中", value: "archiving" },
      { label: "已完成", value: "succeeded" },
      { label: "失败", value: "failed" },
      { label: "待核实", value: "unknown" },
      { label: "已取消", value: "cancelled" },
    ],
  },
];
const statusMap: Record<
  ComfyTaskStatus,
  { text: string; type: "success" | "warning" | "danger" | "info" | "primary" }
> = {
  pending: { text: "等待执行", type: "info" },
  submitting: { text: "提交中", type: "primary" },
  queued: { text: "队列中", type: "warning" },
  running: { text: "执行中", type: "primary" },
  archiving: { text: "归档中", type: "warning" },
  succeeded: { text: "已完成", type: "success" },
  failed: { text: "失败", type: "danger" },
  cancelled: { text: "已取消", type: "info" },
  unknown: { text: "待核实", type: "warning" },
};

function statusInfo(status: ComfyTaskStatus) {
  return statusMap[status] || statusMap.unknown;
}
const COMFY_CLOUD_SUBSCRIPTION_HINT =
  "Comfy Cloud API 调用仅对付费订阅账户开放；免费账户只能在网页编辑器中运行，单独充值额度不能解锁 API，必须开通付费订阅。";

function taskStageText(row: ComfyTask) {
  if (row.status !== "failed") return row.stage;
  const errorMessage = row.errorMessage?.trim();
  if (!errorMessage) return row.stage || "执行失败";
  const isHistoricalCloud403 =
    /(?:Comfy Cloud|cloud\.comfy\.org)/i.test(errorMessage) &&
    /(?:HTTP\s*403|AccessDenied|无权访问)/i.test(errorMessage) &&
    !errorMessage.includes("付费订阅");
  return isHistoricalCloud403
    ? `${COMFY_CLOUD_SUBSCRIPTION_HINT} 原始错误：${errorMessage}`
    : errorMessage;
}
function openView(row: ComfyTask) {
  viewingId.value = row.id;
  viewVisible.value = true;
}
async function cancel(row: ComfyTask) {
  cancellingId.value = row.id;
  try {
    await cancelComfyTask(row.id);
    ElMessage.success("任务已取消");
    await tableRef.value?.refresh();
  } finally {
    cancellingId.value = null;
  }
}
async function retry(row: ComfyTask) {
  retryingId.value = row.id;
  try {
    const task = await retryComfyTask(row.id);
    ElMessage.success(`任务 #${task.id} 已重新进入执行队列`);
    await tableRef.value?.refresh();
  } finally {
    retryingId.value = null;
  }
}
async function refresh() {
  await tableRef.value?.refresh();
}

onMounted(() => {
  timer = window.setInterval(() => void tableRef.value?.refresh(), 4000);
});
onBeforeUnmount(() => timer && window.clearInterval(timer));

defineExpose({ refresh });
</script>

<template>
  <Table
    ref="tableRef"
    perm-module="comfyTask"
    :columns="columns"
    :search-fields="searchFields"
    :request="getComfyTasks"
    :delete-request="(row) => deleteComfyTask(row.id)"
    :batch-delete-request="({ ids }) => batchDeleteComfyTasks(ids as number[])"
    :check-able="true"
    :show-edit="false"
    action-width="270"
    @view="openView"
  >
    <template #toolbar>
      <slot name="toolbar" />
      <Button
        perm="ComfyTask.batchDelete"
        :confirm="false"
        @click="tableRef?.runBatchDelete()"
        >批量删除</Button
      >
    </template>
    <template #column-id="{ row }">#{{ row.id }}</template>
    <template #column-outputType="{ row }">{{
      row.outputType === "video" ? "视频" : "图片"
    }}</template>
    <template #column-status="{ row }">
      <el-tag :type="statusInfo(row.status).type">{{
        statusInfo(row.status).text
      }}</el-tag>
    </template>
    <template #column-stage="{ row }">
      <span
        class="task-stage"
        :class="{ 'task-stage--failed': row.status === 'failed' }"
        :title="taskStageText(row)"
        >{{ taskStageText(row) }}</span
      >
    </template>
    <template #column-createdAt="{ row }">{{
      formatDateTime(row.createdAt)
    }}</template>
    <template #actions="{ row }">
      <Button
        v-if="row.status === 'failed'"
        perm="ComfyTask.create"
        link
        icon="RefreshRight"
        confirm
        :confirm-text="`确认重新执行任务 #${row.id}？原错误状态将被新的执行状态替换。`"
        :loading="retryingId === row.id"
        @click="retry(row)"
        >重新执行</Button
      >
      <Button
        v-if="row.status === 'pending'"
        perm="ComfyTask.update"
        link
        :confirm-text="`确认取消任务 #${row.id}？`"
        :loading="cancellingId === row.id"
        @click="cancel(row)"
        >取消</Button
      >
    </template>
  </Table>
  <View v-model:visible="viewVisible" :task-id="viewingId" />
</template>

<style scoped>
.task-stage {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-stage--failed {
  color: var(--el-color-danger);
  font-weight: 500;
}
</style>
