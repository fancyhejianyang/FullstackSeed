<script setup lang="ts">
/** Single-file upload, atomic URL/name/text updates, and authenticated downloads. */
import type { UploadFile } from 'element-plus';
import { onBeforeUnmount, ref, watch } from 'vue';
import { Document, UploadFilled } from '@element-plus/icons-vue';
import { downloadUpload, type UploadRequest } from '@/api/upload';
import Button from './Button.vue';
import { getUploadErrorMessage, useSingleUpload, type UploadStatus } from './useSingleUpload';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{
  accept?: string;
  maxSizeMb?: number;
  disabled?: boolean;
  dragText?: string;
  readText?: boolean;
  contextKey?: string | number;
  validateEvent?: boolean;
  uploadRequest?: UploadRequest;
}>(), {
  accept: '', maxSizeMb: 20, disabled: false,
  dragText: '将文件拖到此处，或点击上传', readText: false, validateEvent: true,
});

const model = defineModel<string | null>({ default: '' });
const name = defineModel<string>('name', { default: '' });
const content = defineModel<string>('content', { default: '' });
const emit = defineEmits<{
  change: [value: string | null, fileName: string, file?: UploadFile];
  remove: [];
  'uploading-change': [value: boolean];
  progress: [percentage: number];
  'status-change': [status: UploadStatus];
  error: [error: Error];
}>();
const {
  uploading, disabled, status, progress, error, pickerKey, pendingName, canRetry,
  handleChange, handleExceed, reset, abort, retry, remove, validate,
} = useSingleUpload(props, model, {
  events: {
    uploading: (value) => emit('uploading-change', value),
    progress: (value) => emit('progress', value),
    status: (value) => emit('status-change', value),
    error: (value) => emit('error', value),
  },
  commit: (result, file, text) => {
    name.value = result.originalName || file.name;
    content.value = text;
    model.value = result.url;
    emit('change', result.url, name.value, file);
  },
});

function handleRemove() {
  remove(() => {
    name.value = '';
    model.value = '';
    content.value = '';
    emit('remove');
    emit('change', '', '');
  });
}

const downloading = ref(false);
const downloadError = ref('');
let downloadController: AbortController | undefined;
function resetDownload() {
  downloadController?.abort();
  downloadController = undefined;
  downloading.value = false;
  downloadError.value = '';
}
async function downloadFile() {
  if (!model.value || downloading.value) return;
  resetDownload();
  const controller = new AbortController();
  downloadController = controller;
  downloading.value = true;
  try { await downloadUpload(model.value, name.value || '附件文件', controller.signal); }
  catch (reason) {
    const message = await getUploadErrorMessage(reason);
    if (!controller.signal.aborted) downloadError.value = '下载失败：' + message;
  } finally {
    if (downloadController === controller) {
      downloadController = undefined;
      downloading.value = false;
    }
  }
}
watch(() => [props.contextKey, model.value], resetDownload, { flush: 'sync' });
onBeforeUnmount(resetDownload);
defineExpose({ uploading, status, progress, error, validate, reset, abort, retry });
</script>

<template>
  <div class="upload-file" :class="$attrs.class" :style="$attrs.style">
    <div v-if="model" class="upload-file__item">
      <el-icon><Document /></el-icon>
      <Button class="upload-file__name" link type="primary" :loading="downloading" @click="downloadFile">
        {{ name || '附件文件' }}
      </Button>
      <Button v-if="!disabled" link type="info" :confirm="false" aria-label="移除文件" @click="handleRemove">移除</Button>
    </div>
    <el-upload
      v-else
      :key="pickerKey"
      v-bind="$attrs"
      drag
      :auto-upload="false"
      :limit="1"
      :multiple="false"
      :accept="props.accept"
      :disabled="disabled || uploading"
      :show-file-list="false"
      :on-change="handleChange"
      :on-exceed="handleExceed"
    >
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">{{ uploading ? pendingName : props.dragText }}</div>
    </el-upload>
    <div v-if="uploading" class="upload-file__state" role="status">
      <span>{{ status === 'validating' ? '正在检查文件' : '上传中 ' + progress + '%' }}</span>
      <Button link type="info" :confirm="false" @click="abort">取消</Button>
      <el-progress v-if="status === 'uploading'" :percentage="progress" :show-text="false" />
    </div>
    <div v-if="error" class="upload-file__error" role="alert">
      <span>{{ error }}</span>
      <Button v-if="canRetry" link type="primary" :disabled="disabled" @click="retry">重试</Button>
      <Button link type="info" :disabled="disabled" :confirm="false" @click="reset">清除</Button>
    </div>
    <div v-if="downloadError" class="upload-file__error" role="alert">{{ downloadError }}</div>
  </div>
</template>

<style scoped>
.upload-file { width: 100%; }
.upload-file__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  color: var(--el-text-color-regular);
  background-color: var(--el-fill-color-light);
}
.upload-file__name { max-width: 320px; min-width: 0; }
.upload-file__name :deep(span) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.upload-file__state { margin-top: 6px; color: var(--el-text-color-secondary); font-size: 12px; }
.upload-file__error { margin-top: 4px; color: var(--el-color-danger); font-size: 12px; line-height: 1.5; }
</style>
