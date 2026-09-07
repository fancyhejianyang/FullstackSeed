<script setup lang="ts">
import { computed } from 'vue';
import Dialog from '@/components/Dialog.vue';
import type { KnowledgeRoutingRule } from '@/api/knowledgeRoutingRule';

const props = defineProps<{
  row?: KnowledgeRoutingRule | null;
}>();

const visible = defineModel<boolean>('visible', { required: true });

const ruleTypeLabel = computed(() => {
  const value = props.row?.ruleType;
  if (value === 'alias') return '别名升权';
  if (value === 'exclusive') return '专属路由';
  return '公共词降权';
});
</script>

<template>
  <Dialog v-model="visible" title="知识库路由规则详情" width="680px" :show-footer="false">
    <div class="knowledge-routing-rule-view">
      <div><span>路由词</span>{{ row?.term || '—' }}</div>
      <div><span>规则类型</span>{{ ruleTypeLabel }}</div>
      <div><span>匹配方式</span>{{ row?.matchMode === 'exact' ? '精确匹配' : '包含匹配' }}</div>
      <div><span>路由权重</span>{{ row?.weight ?? '—' }}</div>
      <div><span>所属检索配置</span>{{ row?.retrievalConfigName || '—' }}</div>
      <div><span>目标知识库</span>{{ row?.knowledgeBaseNames || '未关联' }}</div>
      <div><span>目标文档</span>{{ row?.documentNames || '未关联' }}</div>
      <div><span>启用状态</span>{{ row?.isEnabled ? '启用' : '停用' }}</div>
      <div><span>说明</span>{{ row?.description || '—' }}</div>
    </div>
  </Dialog>
</template>

<style scoped>
.knowledge-routing-rule-view {
  display: grid;
  gap: 12px;
}

.knowledge-routing-rule-view > div {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 12px;
  line-height: 1.6;
  word-break: break-word;
}

.knowledge-routing-rule-view span {
  color: #909399;
}
</style>
