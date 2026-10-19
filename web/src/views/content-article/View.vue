<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import Button from '@/components/Button.vue';
import Dialog from '@/components/Dialog.vue';
import {
  getContentArticlePreview,
  type ContentArticlePreview,
  type ContentArticleSummary,
} from '@/api/contentArticle';
import { formatDateTime } from '@/utils/format';
import { isActiveTask, taskLabel, taskColor } from './taskState';

const props = defineProps<{ row?: ContentArticleSummary | null }>();
const emit = defineEmits<{ records: [articleId: number] }>();
const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false);
const preview = ref<ContentArticlePreview | null>(null);
const pane = ref<'latest' | 'saved'>('latest');
const detail = computed(() => preview.value?.article);
const latest = computed(() => preview.value?.latestTask);
const content = computed(() => {
  if (pane.value === 'saved') return detail.value?.content || '';
  return latest.value && ['succeeded', 'adopted'].includes(latest.value.status)
    ? latest.value.result || ''
    : '';
});
const generatedTitle = computed(() =>
  latest.value &&
  ['succeeded', 'adopted'].includes(latest.value.status) &&
  latest.value.result
    ? latest.value.generatedTitle || ''
    : '',
);
const displayedTitle = computed(() =>
  pane.value === 'latest' && generatedTitle.value
    ? generatedTitle.value
    : detail.value?.title || '',
);
let epoch = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
async function load(initial = false, silent = false) {
  clearTimeout(timer);
  const current = ++epoch;
  const id = props.row?.id;
  if (!silent) preview.value = null;
  loading.value = false;
  if (!visible.value || !id) return;
  loading.value = true;
  try {
    const result = await getContentArticlePreview(id, silent);
    if (current !== epoch) return;
    preview.value = result;
    if (initial) pane.value = result.latestTask ? 'latest' : 'saved';
    if (isActiveTask(result.latestTask))
      timer = setTimeout(() => {
        void load(false, true);
      }, 3000);
  } catch {
    // 不回显旧正文；页面提供手动重试入口。
    if (current === epoch) preview.value = null;
  } finally {
    if (current === epoch) loading.value = false;
  }
}
watch(
  () => [visible.value, props.row?.id] as const,
  () => {
    pane.value = 'latest';
    void load(true);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  ++epoch;
  clearTimeout(timer);
});
async function copyContent() {
  if (!content.value || loading.value) return;
  try {
    await navigator.clipboard.writeText(content.value);
    ElMessage.success('正文已复制');
  } catch {
    ElMessage.warning('浏览器不支持复制，请选中正文手动复制');
  }
}
async function copyTitle() {
  if (loading.value || !generatedTitle.value || pane.value !== 'latest') return;
  try {
    await navigator.clipboard.writeText(generatedTitle.value);
    ElMessage.success('生成标题已复制');
  } catch {
    ElMessage.warning('复制失败，请选中标题手动复制');
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
        <h2>{{ displayedTitle }}</h2>
        <p
          v-if="pane === 'latest' && generatedTitle"
          class="article-view__title-source"
        >
          生成标题 · 原标题：{{ detail.title }}
        </p>
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
        <el-tabs v-model="pane">
          <el-tab-pane label="最新生成" name="latest">
            <template v-if="latest">
              <div class="article-view__status">
                <el-tag :type="taskColor(latest.status)">{{
                  taskLabel(latest.status)
                }}</el-tag>
                <span
                  >任务 #{{ latest.id }} ·
                  {{ formatDateTime(latest.createdAt) }}</span
                >
              </div>
              <p v-if="isActiveTask(latest)" role="status">
                {{
                  latest.status === 'pending' ? '任务排队中' : '正文生成中'
                }}，完成后自动更新。
              </p>
              <p v-else-if="latest.status === 'succeeded'">
                本次生成稿尚未采用。
              </p>
              <p v-if="content && pane === 'latest' && !generatedTitle">
                该历史记录未生成标题，顶部显示已保存标题。
              </p>
              <p v-if="latest.errorMessage" role="alert">
                {{ latest.errorMessage }}
              </p>
              <details
                v-if="latest.editorNotes?.length"
                class="article-view__idea"
              >
                <summary>
                  {{
                    latest.status === 'needs_input'
                      ? '本次生成提示'
                      : '编辑提示'
                  }}
                </summary>
                <ul>
                  <li v-for="(note, index) in latest.editorNotes" :key="index">
                    {{ note }}
                  </li>
                </ul>
              </details>
              <pre
                v-if="pane === 'latest' && content"
                class="article-view__content"
                >{{ content }}</pre
              >
              <el-empty
                v-else-if="
                  !isActiveTask(latest) &&
                  !['succeeded', 'adopted'].includes(latest.status)
                "
                description="本次未生成正文"
              />
            </template>
            <el-empty v-else description="暂无生成记录" />
          </el-tab-pane>
          <el-tab-pane label="已保存正文" name="saved">
            <pre class="article-view__content">{{
              detail.content || '尚未保存正文'
            }}</pre>
          </el-tab-pane>
        </el-tabs>
      </template>
      <el-empty v-else-if="!loading" description="内容读取失败，请刷新重试" />
    </div>
    <template #footer>
      <Button
        perm="ContentArticle.read"
        icon="Refresh"
        :disabled="loading"
        @click="load()"
        >刷新</Button
      >
      <Button
        v-if="row"
        perm="ContentArticle.read"
        :disabled="loading"
        @click="emit('records', row.id)"
        >生成记录</Button
      >
      <Button :disabled="!content || loading" @click="copyContent">{{
        pane === 'latest' ? '复制最新生成稿' : '复制已保存正文'
      }}</Button>
      <Button
        v-if="pane === 'latest' && generatedTitle"
        :disabled="loading"
        @click="copyTitle"
        >复制生成标题</Button
      >
      <Button @click="visible = false">关闭</Button>
    </template>
  </Dialog>
</template>

<style scoped>
.article-view {
  max-width: 800px;
  min-height: 160px;
  margin: auto;
  color: #303133;
}
.article-view h2 {
  margin-top: 0;
  overflow-wrap: anywhere;
}
.article-view__title-source {
  color: #606266;
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
  overflow-wrap: anywhere;
}
.article-view__idea summary {
  cursor: pointer;
}
.article-view__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  color: #606266;
}
</style>
