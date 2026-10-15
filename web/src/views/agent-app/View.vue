<script setup lang="ts">
import { ref, watch } from "vue";
import Dialog from "@/components/Dialog.vue";
import Button from "@/components/Button.vue";
import { getAgentApp, type AgentApp } from "@/api/agentApp";
import { formatDateTime } from "@/utils/format";

const props = defineProps<{ row?: AgentApp | null }>();
const visible = defineModel<boolean>("visible", { required: true });
const loading = ref(false);
const detail = ref<AgentApp | null>(null);

watch(visible, async (value) => {
  if (!value) {
    detail.value = null;
    return;
  }
  if (!props.row?.id) return;
  loading.value = true;
  try {
    detail.value = await getAgentApp(props.row.id);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <Dialog
    v-model="visible"
    title="Agent 应用详情"
    width="760px"
    :show-footer="false"
  >
    <el-descriptions v-loading="loading" :column="1" border>
      <el-descriptions-item label="名称">{{
        detail?.name || "-"
      }}</el-descriptions-item>
      <el-descriptions-item label="职责">{{
        detail?.responsibility || "-"
      }}</el-descriptions-item>
      <el-descriptions-item label="聊天配置">{{
        detail?.aiFeatureConfigName || "-"
      }}</el-descriptions-item>
      <el-descriptions-item label="知识工作流">{{
        detail?.workflowName || "-"
      }}</el-descriptions-item>
      <el-descriptions-item label="工具白名单">
        <el-tag v-for="key in detail?.toolKeys || []" :key="key" type="info">{{
          key
        }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="人员范围">
        {{
          detail?.accessScope === "all"
            ? "全部有权限员工"
            : `指定 ${detail?.allowedUserIds?.length || 0} 人`
        }}
      </el-descriptions-item>
      <el-descriptions-item label="执行限制">
        每轮 {{ detail?.maxToolCalls ?? "-" }} 次工具 /
        {{ detail?.timeoutSeconds ?? "-" }} 秒 / 每人并发
        {{ detail?.maxConcurrentRuns ?? "-" }}
      </el-descriptions-item>
      <el-descriptions-item label="写入能力">{{
        detail?.writeEnabled ? "已启用（仍需确认）" : "关闭"
      }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{
        detail?.isEnabled ? "启用" : "停用"
      }}</el-descriptions-item>
      <el-descriptions-item label="更新时间">
        {{ detail?.updatedAt ? formatDateTime(detail.updatedAt) : "-" }}
      </el-descriptions-item>
    </el-descriptions>
    <template #footer><Button @click="visible = false">关闭</Button></template>
  </Dialog>
</template>

<style scoped>
.el-tag + .el-tag {
  margin-left: 6px;
}
</style>
