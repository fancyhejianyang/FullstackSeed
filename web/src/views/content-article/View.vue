<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import Button from '@/components/Button.vue';
import Tasks from './Tasks.vue';
import Dialog from '@/components/Dialog.vue';
import {
  getContentArticle,
  type ContentArticle,
  type ContentArticleSummary,
} from '@/api/contentArticle';

const props = defineProps<{ row?: ContentArticleSummary | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false);
const detail = ref<ContentArticle | null>(null);
let epoch = 0;
watch(
  () => [visible.value, props.row?.id] as const,
  async ([open, id]) => {
    const current = ++epoch;
    detail.value = null;
    loading.value = false;
    if (!open || !id) return;
    loading.value = true;
    try {
      const result = await getContentArticle(id);
      if (current === epoch) detail.value = result;
    } catch {
      /* 请求层显示错误，绝不回显上一条记录。 */
    } finally {
      if (current === epoch) loading.value = false;
    }
  },
);
onBeforeUnmount(() => {
  ++epoch;
});
async function copyContent() {
  if (!detail.value?.content) return;
  try {
    await navigator.clipboard.writeText(detail.value.content);
    ElMessage.success('正文已复制');
  } catch {
    ElMessage.warning('浏览器不支持复制，请选中正文手动复制');
  }
}
</script>

<template>
  <Dialog
    v-model="visible"
    title="查看内容"
    width="min(1000px, 94vw)"
    :show-footer="false"
  >
    <div v-loading="loading" class="article-view">
      <template v-if="detail">
        <h2>{{ detail.title }}</h2>
        <el-image
          v-if="detail.coverUrl"
          class="article-view__cover"
          :src="detail.coverUrl"
          :preview-src-list="[detail.coverUrl]"
          preview-teleported
          fit="contain"
        />
        <details class="article-view__idea">
          <summary>想法</summary>
          <pre>{{ detail.idea || '暂无想法' }}</pre>
        </details>
        <pre class="article-view__content">{{
          detail.content || '尚未生成正文'
        }}</pre>
        <Tasks
          v-if="visible"
          :key="detail.id"
          :article-id="detail.id"
          :version="detail.version"
          can-adopt
          @adopted="
            detail = $event;
            emit('success');
          "
        />
      </template>
      <el-empty v-else-if="!loading" description="内容读取失败" />
    </div>
    <template #footer>
      <Button :disabled="!detail?.content || loading" @click="copyContent"
        >复制正文</Button
      >
      <Button @click="visible = false">关闭</Button>
    </template>
  </Dialog>
</template>

<style scoped>
.article-view {
  max-width: 800px;
  margin: auto;
  color: #303133;
}
.article-view h2 {
  margin-top: 0;
  overflow-wrap: anywhere;
}
.article-view pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  line-height: 1.9;
}
.article-view__cover {
  display: block;
  max-width: 100%;
  max-height: 260px;
  margin: 16px auto;
}
.article-view__idea {
  margin: 20px 0;
  padding: 12px 16px;
  border-radius: 6px;
  background: #f0f2f5;
  color: #606266;
}
.article-view__idea summary {
  cursor: pointer;
}
</style>
