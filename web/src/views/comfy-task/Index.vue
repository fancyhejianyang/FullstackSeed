<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import PageContainer from "@/components/PageContainer.vue";
import Table, { type TableColumn } from "@/components/Table.vue";
import Button from "@/components/Button.vue";
import type { FormField } from "@/components/Form.vue";
import { formatDateTime } from "@/utils/format";
import {
  batchDeleteComfyTasks,
  cancelComfyTask,
  deleteComfyTask,
  getComfyTasks,
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
let timer: number | undefined;
const columns: TableColumn[] = [
  { prop: "id", label: "任务", width: 90, slot: true },
  { prop: "workflowName", label: "工作流", minWidth: 180 },
  { prop: "outputType", label: "类型", width: 80, slot: true },
  { prop: "status", label: "状态", width: 110, slot: true },
  { prop: "stage", label: "当前阶段", minWidth: 180 },
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
onMounted(() => {
  timer = window.setInterval(() => void tableRef.value?.refresh(), 4000);
});
onBeforeUnmount(() => timer && window.clearInterval(timer));
</script>

<template>
  <PageContainer title="ComfyUI 生成记录">
    <Table
      ref="tableRef"
      perm-module="comfyTask"
      :columns="columns"
      :search-fields="searchFields"
      :request="getComfyTasks"
      :delete-request="(row) => deleteComfyTask(row.id)"
      :batch-delete-request="
        ({ ids }) => batchDeleteComfyTasks(ids as number[])
      "
      :check-able="true"
      :show-edit="false"
      action-width="210"
      @view="openView"
    >
      <template #toolbar>
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
      <template #column-createdAt="{ row }">{{
        formatDateTime(row.createdAt)
      }}</template>
      <template #actions="{ row }">
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
  </PageContainer>
</template>
