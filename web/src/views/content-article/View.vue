<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { ElMessage } from 'element-plus';
import Button from '@/components/Button.vue';
import Checkbox from '@/components/Checkbox.vue';
import Dialog from '@/components/Dialog.vue';
import { useUserStore } from '@/stores/user';
import {
  adoptContentTask,
  getContentArticlePreview,
  type ContentArticle,
  type ContentArticlePreview,
  type ContentArticleSummary,
} from '@/api/contentArticle';
import { isActiveTask, taskLabel, taskColor } from './taskState';

const props = defineProps<{ row?: ContentArticleSummary | null }>();
const emit = defineEmits<{ adopted: [article: ContentArticle] }>();
const visible = defineModel<boolean>('visible', { required: true });
const user = useUserStore();
const loading = ref(false);
const adopting = ref(false);
const adoptTitle = ref(false);
const preview = ref<ContentArticlePreview | null>(null);
const detail = computed(() => preview.value?.article);
const latest = computed(() => preview.value?.latestTask);
const content = computed(() =>
  latest.value && ['succeeded', 'adopted'].includes(latest.value.status)
    ? latest.value.result || ''
    : '',
);
const generatedTitle = computed(() =>
  latest.value &&
  ['succeeded', 'adopted'].includes(latest.value.status) &&
  latest.value.result
    ? latest.value.generatedTitle || ''
    : '',
);
const canAdopt = computed(
  () =>
    visible.value &&
    !loading.value &&
    !adopting.value &&
    !!content.value &&
    latest.value?.status === 'succeeded' &&
    latest.value.articleVersion === detail.value?.version &&
    user.hasPermission('ContentArticle.update'),
);
const adoptConfirmation = computed(() =>
  adoptTitle.value && generatedTitle.value
    ? '采纳后将替换文章标题与正文并立即保存，确认采纳？'
    : '采纳后将替换文章正文并立即保存，确认采纳？',
);
let alive = true;
let epoch = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
async function load(silent = false) {
  clearTimeout(timer);
  const current = ++epoch;
  const id = props.row?.id;
  const previousTaskId = latest.value?.id;
  const hadTitle = !!generatedTitle.value;
  if (!silent) preview.value = null;
  loading.value = false;
  if (!visible.value || !id) return;
  loading.value = true;
  try {
    const result = await getContentArticlePreview(id, silent);
    if (!alive || current !== epoch) return;
    preview.value = result;
    if (!silent || previousTaskId !== result.latestTask?.id || !hadTitle)
      adoptTitle.value = !!generatedTitle.value;
    if (!generatedTitle.value) adoptTitle.value = false;
    if (isActiveTask(result.latestTask))
      timer = setTimeout(() => {
        void load(true);
      }, 3000);
  } catch {
    // 不回显旧正文；重新打开弹窗时重新读取。
    if (current === epoch) preview.value = null;
  } finally {
    if (current === epoch) loading.value = false;
  }
}
watch(
  () => [visible.value, props.row?.id] as const,
  () => {
    adoptTitle.value = false;
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  alive = false;
  ++epoch;
  clearTimeout(timer);
  window.removeEventListener('beforeunload', beforeUnload);
});
async function adopt() {
  if (!canAdopt.value || !latest.value || !detail.value) return;
  const task = latest.value;
  const version = detail.value.version;
  const current = ++epoch;
  clearTimeout(timer);
  adopting.value = true;
  try {
    const article = await adoptContentTask(
      task.id,
      version,
      adoptTitle.value && !!generatedTitle.value,
    );
    if (!alive || current !== epoch) return;
    preview.value = { article, latestTask: { ...task, status: 'adopted' } };
    emit('adopted', article);
    ElMessage.success('已采纳并保存');
  } catch {
    // 请求层显示错误；保留生成稿供复制，不绕过服务端版本校验。
  } finally {
    adopting.value = false;
  }
}
function canLeave() {
  return !adopting.value;
}
function requestClose() {
  if (canLeave()) visible.value = false;
}
function beforeClose(done: () => void) {
  if (!canLeave()) return;
  requestClose();
  done();
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!adopting.value) return;
  event.preventDefault();
  event.returnValue = '';
}
onBeforeRouteLeave(canLeave);
onBeforeRouteUpdate(canLeave);
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
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
  if (loading.value || !generatedTitle.value) return;
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
    :before-close="beforeClose"
    :close-on-press-escape="!adopting"
    :show-close="!adopting"
  >
    <div v-loading="loading" class="article-view">
      <template v-if="detail">
        <template v-if="latest">
          <template v-if="generatedTitle">
            <p class="article-view__title-label">AI 推荐标题</p>
            <h2>{{ generatedTitle }}</h2>
          </template>
          <p v-else-if="content" class="article-view__notice">
            本次未生成推荐标题，采纳正文时保留原标题。
          </p>
          <div class="article-view__status">
            <el-tag :type="taskColor(latest.status)">{{
              taskLabel(latest.status)
            }}</el-tag>
          </div>
          <p v-if="isActiveTask(latest)" role="status">
            {{
              latest.status === 'pending' ? '任务排队中' : '正文生成中'
            }}，完成后自动更新。
          </p>
          <p
            v-if="
              latest.status === 'succeeded' &&
              latest.articleVersion !== detail.version
            "
            class="article-view__notice"
          >
            文章已修改，不能直接采纳；可复制生成内容后在编辑中合并。
          </p>
          <p v-if="latest.errorMessage" role="alert">
            {{ latest.errorMessage }}
          </p>
          <details
            v-if="latest.status === 'needs_input' && latest.editorNotes?.length"
            class="article-view__notes"
          >
            <summary>本次生成提示</summary>
            <ul>
              <li v-for="(note, index) in latest.editorNotes" :key="index">
                {{ note }}
              </li>
            </ul>
          </details>
          <pre v-if="content" class="article-view__content">{{ content }}</pre>
          <el-empty
            v-else-if="!isActiveTask(latest)"
            description="本次未生成正文"
          />
        </template>
        <el-empty v-else description="暂无生成内容，请先使用 AI 生成" />
      </template>
      <el-empty
        v-else-if="!loading"
        description="内容读取失败，请关闭后重新打开"
      />
    </div>
    <template #footer>
      <div class="article-view__actions">
        <Button v-if="generatedTitle" :disabled="loading" @click="copyTitle"
          >复制推荐标题</Button
        >
        <Button :disabled="!content || loading" @click="copyContent"
          >复制正文</Button
        >
        <Checkbox
          v-if="
            generatedTitle &&
            latest?.status === 'succeeded' &&
            user.hasPermission('ContentArticle.update')
          "
          v-model="adoptTitle"
          :disabled="!canAdopt"
          label="同时采纳推荐标题"
        />
        <Button
          v-if="latest?.status === 'succeeded' && content"
          perm="ContentArticle.update"
          :disabled="!canAdopt"
          :loading="adopting"
          confirm
          :confirm-text="adoptConfirmation"
          @click="adopt"
          >采纳并保存</Button
        >
        <Button :disabled="adopting" @click="requestClose">关闭</Button>
      </div>
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
.article-view__title-label,
.article-view__notice {
  color: #606266;
  overflow-wrap: anywhere;
}
.article-view pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  line-height: 1.9;
}
.article-view__notes {
  margin: 20px 0;
  padding: 12px 16px;
  border-radius: 6px;
  background: #f0f2f5;
  color: #606266;
  overflow-wrap: anywhere;
}
.article-view__notes summary {
  cursor: pointer;
}
.article-view__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  color: #606266;
}
.article-view__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
}
.article-view__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
