<script setup lang="ts">
import { computed } from "vue";
import type { AgentExecutionStatus } from "@/api/agentWorkspace";

const props = defineProps<{
  status: AgentExecutionStatus;
  errorMessage?: string | null;
}>();

const statusMeta = computed(() => {
  const map: Record<
    AgentExecutionStatus,
    {
      label: string;
      type: "info" | "primary" | "success" | "warning" | "danger";
    }
  > = {
    queued: { label: "排队中", type: "info" },
    running: { label: "执行中", type: "primary" },
    waiting_input: { label: "待补充", type: "warning" },
    waiting_confirmation: { label: "待确认", type: "warning" },
    submitting: { label: "提交中", type: "primary" },
    verifying: { label: "正在核实结果", type: "warning" },
    succeeded: { label: "已完成", type: "success" },
    failed: { label: "失败", type: "danger" },
    cancelled: { label: "已停止", type: "info" },
  };
  return map[props.status];
});
</script>

<template>
  <div class="execution-status">
    <el-tag :type="statusMeta.type">{{ statusMeta.label }}</el-tag>
    <span v-if="errorMessage" class="execution-status__error">{{
      errorMessage
    }}</span>
  </div>
</template>

<style scoped>
.execution-status {
  display: flex;
  align-items: center;
  gap: 8px;
}
.execution-status__error {
  color: #f56c6c;
  font-size: 12px;
}
</style>
