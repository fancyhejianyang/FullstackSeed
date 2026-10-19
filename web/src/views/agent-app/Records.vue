<script setup lang="ts">
import { ref } from "vue";
import PageContainer from "@/components/PageContainer.vue";
import Table, { type TableColumn } from "@/components/Table.vue";
import type { FormField } from "@/components/Form.vue";
import { formatDateTime } from "@/utils/format";
import AgentExecutionStatusTag from "@/views/agent-workspace/components/AgentExecutionStatus.vue";
import {
  getAgentExecutionRecords,
  type AgentExecutionRecord,
  type AgentExecutionStatus,
} from "@/api/agentWorkspace";
import RecordView from "./RecordView.vue";
import { statusReasonLabel, toolLabel } from "./executionRecord";

const viewVisible = ref(false);
const currentRow = ref<AgentExecutionRecord | null>(null);

const columns: TableColumn[] = [
  { prop: "id", label: "ID", width: 80 },
  { prop: "requestId", label: "请求号", minWidth: 260 },
  { prop: "agentAppId", label: "Agent ID", width: 100 },
  { prop: "userId", label: "用户 ID", width: 100 },
  { prop: "sessionId", label: "会话 ID", width: 100 },
  { prop: "toolKey", label: "执行能力", minWidth: 180, slot: true },
  { prop: "status", label: "状态", width: 130, slot: true },
  { prop: "elapsedMilliseconds", label: "耗时", width: 110, slot: true },
  { prop: "tokenUsage", label: "Token", width: 150, slot: true },
  { prop: "statusReason", label: "状态原因", width: 150, slot: true },
  { prop: "createdAt", label: "开始时间", width: 180, slot: true },
];

const searchFields: FormField[] = [
  {
    prop: "status",
    label: "执行状态",
    type: "select",
    options: [
      { label: "全部", value: "" },
      { label: "执行中", value: "running" },
      { label: "待补充", value: "waiting_input" },
      { label: "待确认", value: "waiting_confirmation" },
      { label: "提交中", value: "submitting" },
      { label: "核实中", value: "verifying" },
      { label: "处理完成", value: "succeeded" },
      { label: "失败", value: "failed" },
      { label: "已停止", value: "cancelled" },
    ],
  },
  {
    prop: "keyword",
    label: "关键词",
    type: "input",
    placeholder: "请求号/错误",
  },
];

function request(params: Record<string, unknown>) {
  return getAgentExecutionRecords(
    params as {
      page?: number;
      pageSize?: number;
      status?: AgentExecutionStatus | "";
      keyword?: string;
    },
  );
}

function openView(row: AgentExecutionRecord) {
  currentRow.value = row;
  viewVisible.value = true;
}
</script>

<template>
  <PageContainer title="Agent 执行记录">
    <Table
      :columns="columns"
      :search-fields="searchFields"
      :request="request"
      perm-module="agentApp"
      :show-edit="false"
      :show-delete="false"
      :action-width="90"
      :fit="false"
      @view="openView"
    >
      <template #column-toolKey="{ row }">
        {{ toolLabel(row.toolKey) }}
      </template>
      <template #column-status="{ row }">
        <!-- 列表只表达执行状态；真实业务回执在详情中核实，不依赖已移除的 result。 -->
        <AgentExecutionStatusTag :status="row.status" />
      </template>
      <template #column-elapsedMilliseconds="{ row }">
        {{
          row.elapsedMilliseconds == null
            ? "-"
            : `${row.elapsedMilliseconds} ms`
        }}
      </template>
      <template #column-tokenUsage="{ row }">
        {{ row.totalTokens == null ? "-" : row.totalTokens }}
        <small v-if="row.modelCallDurationMs != null">
          / {{ row.modelCallDurationMs }} ms
        </small>
      </template>
      <template #column-statusReason="{ row }">
        {{ statusReasonLabel(row.statusReason) }}
      </template>
      <template #column-createdAt="{ row }">{{
        formatDateTime(row.createdAt)
      }}</template>
    </Table>
    <RecordView v-model:visible="viewVisible" :row="currentRow" />
  </PageContainer>
</template>
