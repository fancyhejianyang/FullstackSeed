<script setup lang="ts">
import PageContainer from "@/components/PageContainer.vue";
import Table, { type TableColumn } from "@/components/Table.vue";
import type { FormField } from "@/components/Form.vue";
import { formatDateTime } from "@/utils/format";
import AgentExecutionStatusTag from "@/views/agent-workspace/components/AgentExecutionStatus.vue";
import {
  getAgentExecutionRecords,
  type AgentExecution,
  type AgentExecutionStatus,
} from "@/api/agentWorkspace";

const columns: TableColumn[] = [
  { prop: "id", label: "ID", width: 80 },
  { prop: "requestId", label: "请求号", minWidth: 260 },
  { prop: "agentAppId", label: "Agent ID", width: 100 },
  { prop: "userId", label: "用户 ID", width: 100 },
  { prop: "sessionId", label: "会话 ID", width: 100 },
  { prop: "toolKey", label: "执行能力", minWidth: 180, slot: true },
  { prop: "status", label: "状态", width: 120, slot: true },
  { prop: "parameterSummary", label: "参数摘要", minWidth: 260, slot: true },
  { prop: "result", label: "结果摘要", minWidth: 260, slot: true },
  { prop: "elapsedMilliseconds", label: "耗时", width: 110, slot: true },
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

function toolLabel(toolKey: AgentExecution["toolKey"]) {
  const labels: Record<AgentExecution["toolKey"], string> = {
    "model.chat": "模型对话",
    "knowledge.answer": "知识增强",
    "product.query": "产品/SKU 查询",
    "productSku.create": "受控新增 SKU",
  };
  return labels[toolKey];
}
</script>

<template>
  <PageContainer title="Agent 执行记录">
    <Table
      :columns="columns"
      :search-fields="searchFields"
      :request="request"
      :show-actions="false"
      :fit="false"
    >
      <template #column-toolKey="{ row }">
        {{ toolLabel(row.toolKey) }}
      </template>
      <template #column-status="{ row }">
        <AgentExecutionStatusTag
          :status="row.status"
          :tool-key="row.toolKey"
          :result="row.result"
        />
      </template>
      <template #column-parameterSummary="{ row }">
        <code>{{ JSON.stringify(row.parameterSummary) }}</code>
      </template>
      <template #column-result="{ row }">
        <code>{{ row.errorMessage || JSON.stringify(row.result) }}</code>
      </template>
      <template #column-elapsedMilliseconds="{ row }">
        {{
          row.elapsedMilliseconds == null
            ? "-"
            : `${row.elapsedMilliseconds} ms`
        }}
      </template>
      <template #column-createdAt="{ row }">{{
        formatDateTime(row.createdAt)
      }}</template>
    </Table>
  </PageContainer>
</template>

<style scoped>
code {
  color: #606266;
  font-family: Consolas, Monaco, monospace;
}
</style>
