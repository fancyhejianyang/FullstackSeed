<script setup lang="ts">
import { computed } from 'vue';
import type { ContentTaskDetail } from '@/api/contentArticle';
const props = defineProps<{ task: ContentTaskDetail }>();
const label = computed(
  () =>
    ({
      pending: '封面待生成',
      running: '封面生成中',
      succeeded: 'AI 候选封面',
      skipped: '已跳过封面',
      failed: '封面生成失败',
      interrupted: '封面已中断',
    })[props.task.coverStatus ?? 'succeeded'] || '封面状态未知',
);
</script>

<template>
  <section v-if="task.coverStatus" class="content-cover" aria-label="生成封面">
    <strong role="status">{{ label }}</strong>
    <template v-if="task.coverStatus === 'succeeded' && task.coverData?.url">
      <img
        :src="task.coverData.url"
        alt="AI 生成的情感表达概念封面"
        loading="lazy"
      />
      <p>概念插画，非新闻现场照片。采纳前请检查画面内容。</p>
      <details v-if="task.coverData.prompt">
        <summary>
          封面构思<span v-if="task.coverData.model">
            · {{ task.coverData.model }}</span
          >
        </summary>
        <p>{{ task.coverData.prompt }}</p>
        <p v-if="task.coverData.totalTokens != null">
          构思用量：{{ task.coverData.totalTokens }} tokens
        </p>
      </details>
    </template>
    <p
      v-else-if="
        task.coverStatus === 'pending' || task.coverStatus === 'running'
      "
    >
      正文已生成，可先复制；封面完成后可一并采纳。
    </p>
    <p v-else>
      {{ task.coverData?.message || '本次没有候选封面，正文不受影响。' }}
    </p>
  </section>
</template>

<style scoped>
.content-cover {
  margin: 20px 0;
  padding: 16px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #f5f9ff;
  color: #303133;
}
.content-cover img {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: 320px;
  object-fit: contain;
  margin-top: 12px;
  border-radius: 6px;
}
.content-cover p {
  color: #606266;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
  margin-bottom: 0;
}
.content-cover summary {
  cursor: pointer;
  margin-top: 12px;
}
</style>
