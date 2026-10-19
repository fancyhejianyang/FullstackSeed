<script setup lang="ts">
import { computed } from "vue";
import PageContainer from "@/components/PageContainer.vue";
import AgentWorkspace from "@/views/agent-workspace/Index.vue";
import { useUserStore } from "@/stores/user";

const userStore = useUserStore();
const canDebug = computed(
  () =>
    userStore.hasPermission("AgentApp.read") &&
    userStore.hasPermission("AgentWorkspace.read"),
);
</script>

<template>
  <AgentWorkspace v-if="canDebug" debug />
  <PageContainer v-else title="Agent 调试">
    <el-empty
      description="调试需要 Agent 应用读取及工作台访问权限，请联系管理员授权"
    />
  </PageContainer>
</template>
