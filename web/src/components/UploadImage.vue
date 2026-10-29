<script setup lang="ts">
/** Single-image upload. Decode selected bytes and share cancellation/validation with UploadFile. */
import type { UploadFile } from 'element-plus';
import { UploadFilled } from '@element-plus/icons-vue';
import type { UploadRequest } from '@/api/upload';
import Button from './Button.vue';
import { useSingleUpload, type UploadStatus } from './useSingleUpload';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{
  accept?: string;
  maxSizeMb?: number;
  disabled?: boolean;
  contextKey?: string | number;
  validateEvent?: boolean;
  uploadRequest?: UploadRequest;
}>(), { accept: 'image/*', maxSizeMb: 5, disabled: false, validateEvent: true });
const model = defineModel<string | null>({ default: '' });
const emit = defineEmits<{
  change: [value: string | null, file?: UploadFile];
  remove: [];
  'uploading-change': [value: boolean];
  progress: [percentage: number];
  'status-change': [status: UploadStatus];
  error: [error: Error];
}>();
const {
  uploading, disabled, status, progress, error, pickerKey, canRetry,
  handleChange, handleExceed, reset, abort, retry, remove, validate,
} = useSingleUpload(props, model, {
  image: true,
  events: {
    uploading: (value) => emit('uploading-change', value),
    progress: (value) => emit('progress', value),
    status: (value) => emit('status-change', value),
    error: (value) => emit('error', value),
  },
  commit: (result, file) => {
    model.value = result.url;
    emit('change', result.url, file);
  },
});
function handleRemove() {
  remove(() => {
    model.value = '';
    emit('remove');
    emit('change', '');
  });
}
defineExpose({ uploading, status, progress, error, validate, reset, abort, retry });
</script>

<template>
  <div class="upload-image" :class="$attrs.class" :style="$attrs.style">
    <!-- Keep previews separate: el-upload must not revoke Blob URLs owned by a business page. -->
    <div v-if="model" class="upload-image__preview el-upload-list__item">
      <el-image :src="model" fit="cover" :preview-src-list="[model]" preview-teleported>
        <template #error><span class="upload-image__unavailable">图片无法显示</span></template>
      </el-image>
      <Button v-if="!disabled" class="upload-image__remove" size="small" :confirm="false" aria-label="移除图片" @click="handleRemove">移除</Button>
    </div>
    <el-upload
      v-else
      :key="pickerKey"
      v-bind="$attrs"
      list-type="picture-card"
      :auto-upload="false"
      :limit="1"
      :multiple="false"
      :show-file-list="false"
      :accept="props.accept"
      :disabled="disabled || uploading"
      :on-change="handleChange"
      :on-exceed="handleExceed"
    >
      <el-icon><UploadFilled /></el-icon>
    </el-upload>
    <div v-if="uploading" class="upload-image__state" role="status">
      <span>{{ status === 'validating' ? '正在检查图片' : '上传中 ' + progress + '%' }}</span>
      <Button link type="info" :confirm="false" @click="abort">取消</Button>
      <el-progress v-if="status === 'uploading'" :percentage="progress" :show-text="false" />
    </div>
    <div v-if="error" class="upload-image__error" role="alert">
      <span>{{ error }}</span>
      <Button v-if="canRetry" link type="primary" :disabled="disabled" @click="retry">重试</Button>
      <Button link type="info" :disabled="disabled" :confirm="false" @click="reset">清除</Button>
    </div>
  </div>
</template>

<style scoped>
.upload-image__preview {
  position: relative;
  width: 148px;
  height: 148px;
  overflow: hidden;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}
.upload-image__preview .el-image { width: 100%; height: 100%; }
.upload-image__remove { position: absolute; bottom: 4px; right: 4px; }
.upload-image__unavailable { display: grid; place-items: center; height: 100%; font-size: 12px; color: var(--el-text-color-secondary); }
.upload-image__state { margin-top: 6px; max-width: 320px; font-size: 12px; color: var(--el-text-color-secondary); }
.upload-image__error { margin-top: 4px; color: var(--el-color-danger); font-size: 12px; line-height: 1.5; }
</style>
