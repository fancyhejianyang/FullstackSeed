<script setup lang="ts">
import { computed } from "vue";
import type {
  AgentExecution,
  AgentExecutionStatus,
} from "@/api/agentWorkspace";
import { getPermissionActionColor } from "@/utils/permission";

const props = defineProps<{
  // API 类型不能约束历史数据或运行时传参；展示层必须容忍缺失/未知状态。
  status?: string | null;
  toolKey?: AgentExecution["toolKey"];
  result?: AgentExecution["result"];
  errorMessage?: string | null;
}>();

const statusMeta = computed(() => {
  // Execution completion is not a write receipt: historical records may have
  // succeeded without a confirmed business record and must remain conservative.
  if (props.status === "succeeded") {
    if (props.toolKey === "media.vision")
      return { label: "识别完成", type: getPermissionActionColor("read") };
    if (props.toolKey === "media.imageGeneration") {
      const images = props.result?.images;
      const hasImage =
        Array.isArray(images) &&
        images.some((image) => typeof image?.id === "number" && image.id > 0);
      return {
        label: hasImage ? "图片生成完成" : "图片结果待核实",
        type: getPermissionActionColor(hasImage ? "create" : "audit"),
      };
    }
    if (props.toolKey?.endsWith(".create")) {
      const recordId = props.result?.recordId;
      const hasReceipt =
        props.result?.recordType === props.toolKey.split(".")[0] &&
        typeof recordId === "number" &&
        Number.isInteger(recordId) &&
        recordId > 0;
      return {
        label: hasReceipt ? "录入成功" : "结果待核实",
        type: getPermissionActionColor(hasReceipt ? "create" : "audit"),
      };
    }
    if (["model.chat", "knowledge.answer"].includes(props.toolKey ?? "")) {
      return { label: "回答完成", type: getPermissionActionColor("read") };
    }
    if (
      [
        "product.query",
        "product.sku.lookup",
        "qa.search",
        "knowledge.retrieve",
        "session.context.read",
      ].includes(props.toolKey ?? "") ||
      /\.(list|detail)$/.test(props.toolKey ?? "")
    ) {
      return { label: "查询完成", type: getPermissionActionColor("read") };
    }
    return { label: "处理完成", type: getPermissionActionColor("read") };
  }

  const map: Record<
    Exclude<AgentExecutionStatus, "succeeded">,
    {
      label: string;
      type: "info" | "primary" | "success" | "warning" | "danger";
    }
  > = {
    queued: { label: "排队中", type: getPermissionActionColor("read") },
    running: { label: "执行中", type: getPermissionActionColor("update") },
    waiting_input: { label: "待补充", type: getPermissionActionColor("audit") },
    waiting_confirmation: {
      label: "待确认",
      type: getPermissionActionColor("audit"),
    },
    submitting: { label: "提交中", type: getPermissionActionColor("update") },
    verifying: {
      label: "正在核实结果",
      type: getPermissionActionColor("audit"),
    },
    failed: { label: "失败", type: getPermissionActionColor("reject") },
    cancelled: { label: "已停止", type: getPermissionActionColor("read") },
  };
  if (
    typeof props.status === "string" &&
    Object.prototype.hasOwnProperty.call(map, props.status)
  ) {
    return map[props.status as Exclude<AgentExecutionStatus, "succeeded">];
  }
  return { label: "未知状态", type: getPermissionActionColor("read") };
});

const statusTitle = computed(() =>
  typeof props.status === "string" && props.status.trim()
    ? `原始执行状态：${props.status}`
    : "执行状态缺失",
);
</script>

<template>
  <div class="execution-status">
    <el-tag :type="statusMeta.type" :title="statusTitle">{{
      statusMeta.label
    }}</el-tag>
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
