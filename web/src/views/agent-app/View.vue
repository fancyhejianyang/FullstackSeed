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

function toolLabel(key: string) {
  return key === "product.query" ? "产品/SKU 查询" : key;
}

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
      <el-descriptions-item label="工作指令（Markdown）">
        <pre class="agent-app-view__instruction">{{
          detail?.instructionMarkdown || "-"
        }}</pre>
      </el-descriptions-item>
      <el-descriptions-item label="模型账号">{{
        detail?.providerName || "-"
      }}</el-descriptions-item>
      <el-descriptions-item label="模型列表">
        <el-tag
          v-for="model in detail?.models || []"
          :key="model"
          type="info"
          >{{ model }}</el-tag
        >
      </el-descriptions-item>
      <el-descriptions-item label="业务工具">
        <template v-if="detail?.toolKeys.length">
          <el-tag v-for="key in detail.toolKeys" :key="key" type="info">{{
            toolLabel(key)
          }}</el-tag>
        </template>
        <span v-else>无</span>
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
.agent-app-view__instruction {
  max-height: 360px;
  margin: 0;
  overflow: auto;
  color: #303133;
  font-family: inherit;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
