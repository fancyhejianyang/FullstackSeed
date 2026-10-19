<script setup lang="ts">
// 沿用 views/demo/View.vue 的按需详情、Dialog 和关闭按钮结构。
import { ref, watch } from "vue";
import Dialog from "@/components/Dialog.vue";
import Button from "@/components/Button.vue";
import { formatDateTime } from "@/utils/format";
import {
  getAgentExecutionRecord,
  type AgentExecution,
  type AgentExecutionRecord,
} from "@/api/agentWorkspace";
import AgentExecutionStatusTag from "@/views/agent-workspace/components/AgentExecutionStatus.vue";
import {
  routingSummary,
  statusReasonLabel,
  toolLabel,
} from "./executionRecord";

const props = defineProps<{ row?: AgentExecutionRecord | null }>();
const visible = defineModel<boolean>("visible", { required: true });
const loading = ref(false);
const failed = ref(false);
const detail = ref<AgentExecution | null>(null);

watch(
  [visible, () => props.row?.id],
  async ([opened, id], _previous, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    detail.value = null;
    failed.value = false;
    loading.value = false;
    if (!opened || !id) return;
    loading.value = true;
    try {
      const result = await getAgentExecutionRecord(id);
      if (current) detail.value = result;
    } catch {
      if (current) failed.value = true;
    } finally {
      if (current) loading.value = false;
    }
  },
  { immediate: true },
);

function formatJson(value: unknown) {
  return value == null ? "—" : JSON.stringify(value, null, 2);
}
</script>

<template>
  <Dialog
    v-model="visible"
    title="Agent 执行详情"
    width="900px"
    :show-footer="false"
  >
    <div v-loading="loading" class="execution-detail">
      <el-empty v-if="failed" description="详情加载失败，请关闭后重试" />
      <template v-else-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="ID">{{
            detail.id
          }}</el-descriptions-item>
          <el-descriptions-item label="执行能力">{{
            toolLabel(detail.toolKey)
          }}</el-descriptions-item>
          <el-descriptions-item label="请求号" :span="2">{{
            detail.requestId
          }}</el-descriptions-item>
          <el-descriptions-item label="Agent ID">{{
            detail.agentAppId
          }}</el-descriptions-item>
          <el-descriptions-item label="用户 ID">{{
            detail.userId
          }}</el-descriptions-item>
          <el-descriptions-item label="会话 ID">{{
            detail.sessionId
          }}</el-descriptions-item>
          <el-descriptions-item label="消息 / 草稿 ID"
            >{{ detail.messageId ?? "—" }} /
            {{ detail.draftId ?? "—" }}</el-descriptions-item
          >
          <el-descriptions-item label="状态">
            <AgentExecutionStatusTag
              :status="detail.status"
              :tool-key="detail.toolKey"
              :result="detail.result"
            />
          </el-descriptions-item>
          <el-descriptions-item label="状态原因">{{
            statusReasonLabel(detail.statusReason)
          }}</el-descriptions-item>
          <el-descriptions-item label="执行耗时">{{
            detail.elapsedMilliseconds == null
              ? "—"
              : `${detail.elapsedMilliseconds} ms`
          }}</el-descriptions-item>
          <el-descriptions-item label="模型耗时">{{
            detail.modelCallDurationMs == null
              ? "—"
              : `${detail.modelCallDurationMs} ms`
          }}</el-descriptions-item>
          <el-descriptions-item label="Token（总 / 输入 / 输出）"
            >{{ detail.totalTokens ?? "—" }} /
            {{ detail.promptTokens ?? "—" }} /
            {{ detail.completionTokens ?? "—" }}</el-descriptions-item
          >
          <el-descriptions-item label="工具调用次数">{{
            detail.toolCallCount
          }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{
            formatDateTime(detail.startedAt || detail.createdAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="完成时间">{{
            detail.finishedAt ? formatDateTime(detail.finishedAt) : "—"
          }}</el-descriptions-item>
          <el-descriptions-item label="失败阶段" :span="2">{{
            detail.failureStage || "—"
          }}</el-descriptions-item>
          <el-descriptions-item label="错误信息" :span="2">
            <pre class="execution-detail__text">{{
              detail.errorMessage || "—"
            }}</pre>
          </el-descriptions-item>
          <el-descriptions-item label="配置版本" :span="2">{{
            detail.configVersion || "—"
          }}</el-descriptions-item>
          <el-descriptions-item label="模型调度" :span="2">
            <pre class="execution-detail__text">{{
              routingSummary(detail)
            }}</pre>
          </el-descriptions-item>
        </el-descriptions>
        <el-collapse class="execution-detail__payloads">
          <el-collapse-item title="执行参数 JSON" name="parameters">
            <pre class="execution-detail__json">{{
              formatJson(detail.parameterSummary)
            }}</pre>
          </el-collapse-item>
          <el-collapse-item title="执行结果 JSON" name="result">
            <pre class="execution-detail__json">{{
              formatJson(detail.result)
            }}</pre>
          </el-collapse-item>
          <el-collapse-item title="配置快照 JSON" name="configuration">
            <pre class="execution-detail__json">{{
              formatJson(detail.configSnapshot)
            }}</pre>
          </el-collapse-item>
        </el-collapse>
      </template>
    </div>
    <template #footer><Button @click="visible = false">关闭</Button></template>
  </Dialog>
</template>

<style scoped>
.execution-detail {
  min-height: 120px;
  overflow-wrap: anywhere;
}
.execution-detail :deep(.el-descriptions__table) {
  table-layout: fixed;
}
.execution-detail__text,
.execution-detail__json {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.execution-detail__json {
  max-height: 320px;
  overflow: auto;
  padding: 12px;
  color: #303133;
  background: #f5f7fa;
  border-radius: 6px;
}
.execution-detail__payloads {
  margin-top: 16px;
}
</style>
