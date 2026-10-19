<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';

const props = defineProps<{ section: 'features' | 'commands' | 'workflows' }>();
const user = useUserStore();
const router = useRouter();
const pages = {
  features: defineAsyncComponent(
    () => import('../ai-feature-config/Index.vue'),
  ),
  commands: defineAsyncComponent(
    () => import('../ai-command-definition/Index.vue'),
  ),
  workflows: defineAsyncComponent(() => import('../ai-workflow/Index.vue')),
};
const tabs = [
  { key: 'features', label: '功能配置', permission: 'Menu.read' },
  {
    key: 'commands',
    label: 'AI 指令集',
    permission: 'AiCommandDefinition.read',
  },
  { key: 'workflows', label: 'AI 工作流', permission: 'AiWorkflow.read' },
] as const;
const visibleTabs = computed(() =>
  tabs.filter((tab) => user.hasPermission(tab.permission)),
);
const current = computed(() =>
  visibleTabs.value.find((tab) => tab.key === props.section),
);
function changeTab(key: string | number) {
  void router.push('/ai-config/' + key);
}
</script>
<template>
  <div class="ai-config">
    <el-tabs :model-value="section" @tab-change="changeTab">
      <el-tab-pane
        v-for="tab in visibleTabs"
        :key="tab.key"
        :name="tab.key"
        :label="tab.label"
      />
    </el-tabs>
    <component :is="pages[current.key]" v-if="current" :key="current.key" />
  </div>
</template>
<style scoped>
.ai-config {
  min-width: 0;
}
.ai-config > :deep(.el-tabs) {
  background: #fff;
  padding: 0 20px;
  border-radius: 6px;
}
.ai-config > :deep(.el-tabs .el-tabs__header) {
  margin: 0;
}
</style>
