<script setup lang="ts">
import type { ContentSourceMaterial } from '@/api/contentArticle';
import { formatDateTime } from '@/utils/format';

defineProps<{ materials?: ContentSourceMaterial[] | null }>();

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
</script>

<template>
  <details v-if="materials?.length" class="source-materials">
    <summary>参考素材与来源（{{ materials.length }}）</summary>
    <p class="source-materials__hint">
      采集时的资料快照，与作者想法分开保存；AI 搜索摘要不代表已核实的完整报道。
    </p>
    <ol>
      <li v-for="(item, index) in materials" :key="`${index}-${item.url}`">
        <a
          v-if="safeUrl(item.url)"
          :href="safeUrl(item.url)"
          target="_blank"
          rel="noopener noreferrer"
          >{{ item.title }}</a
        >
        <span v-else>{{ item.title }}</span>
        <p class="source-materials__hint">
          {{ item.sourceName }} ·
          {{ item.acquisition === 'aiSearch' ? 'AI 联网搜索' : '来源采集' }}
          <template v-if="item.accountName">
            · {{ item.accountName }}（{{
              item.accountMatched ? '账号标识已匹配' : '未确认发布账号'
            }}）</template
          >
          <br />报道时间：{{
            item.publishedAt ? formatDateTime(item.publishedAt) : '来源未提供'
          }}
          · 采集时间：{{ formatDateTime(item.fetchedAt) }}
        </p>
        <p class="source-materials__excerpt">{{ item.contentExcerpt }}</p>
      </li>
    </ol>
  </details>
</template>

<style scoped>
.source-materials {
  margin: 16px 0;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
summary {
  cursor: pointer;
  color: var(--el-text-color-primary);
}
ol {
  max-height: 340px;
  overflow: auto;
  padding-left: 22px;
}
li + li {
  margin-top: 16px;
}
a {
  color: var(--el-color-primary);
  overflow-wrap: anywhere;
}
.source-materials__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.7;
}
.source-materials__excerpt {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
</style>
