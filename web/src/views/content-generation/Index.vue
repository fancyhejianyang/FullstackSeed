<script setup lang="ts">
// 沿用 demo 的 PageContainer / Table / Dialog 列表结构；记录只读，不提供伪 CRUD。
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Tasks from '@/views/content-article/Tasks.vue';

const route = useRoute();
const router = useRouter();
const articleId = computed(() => {
  const id = Number(route.query.articleId);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
});
</script>

<template>
  <PageContainer title="生成记录">
    <div v-if="articleId" class="generation-filter">
      <span>当前文章 #{{ articleId }}</span>
      <Button
        perm="ContentArticle.read"
        link
        @click="router.replace('/content-generation')"
        >查看全部记录</Button
      >
    </div>
    <Tasks :key="articleId ?? 'all'" :article-id="articleId" />
  </PageContainer>
</template>

<style scoped>
.generation-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  color: #606266;
}
</style>
