<script setup lang="ts">
/**
 * UploadFile — 单文件上传/下载回显组件。
 *
 * 核心能力：
 * - 默认未上传时显示拖拽上传区，上传后隐藏拖拽区，仅展示文件名与移除按钮
 * - v-model 保存后端返回的文件 URL，`v-model:name` 保存原始文件名
 * - 默认调用统一上传接口，后端未来切 OSS 时不影响组件和业务字段
 * - 文件名按钮内置下载能力，可下载当前 URL
 * - 可通过 `uploadRequest` 覆盖上传实现，适配直传或特殊业务
 */
import type { UploadFile } from 'element-plus';
import { ref } from 'vue';
import { Document, UploadFilled } from '@element-plus/icons-vue';
import { uploadFile, type UploadResult } from '@/api/upload';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    accept?: string;
    maxSizeMb?: number;
    disabled?: boolean;
    dragText?: string;
    uploadRequest?: (file: File) => Promise<UploadResult>;
  }>(),
  {
    accept: '',
    maxSizeMb: 20,
    disabled: false,
    dragText: '将文件拖到此处，或点击上传',
  },
);

const model = defineModel<string | null>({ default: '' });
const name = defineModel<string>('name', { default: '' });
const error = ref('');
const uploading = ref(false);

const emit = defineEmits<{
  change: [value: string | null, fileName: string, file?: UploadFile];
  remove: [];
}>();

async function handleChange(file: UploadFile) {
  error.value = '';
  if (!file.raw) return;
  if (props.maxSizeMb && file.raw.size > props.maxSizeMb * 1024 * 1024) {
    error.value = `文件不能超过 ${props.maxSizeMb}MB`;
    return;
  }
  uploading.value = true;
  try {
    const result = await (props.uploadRequest ?? uploadFile)(file.raw);
    name.value = result.originalName || file.name;
    model.value = result.url;
    emit('change', result.url, name.value, file);
  } finally {
    uploading.value = false;
  }
}

function handleRemove() {
  name.value = '';
  model.value = '';
  error.value = '';
  emit('remove');
  emit('change', '', '');
}

function downloadFile() {
  if (!model.value) return;
  // 后端统一返回可访问 URL；本地存储和 OSS 都复用同一下载入口。
  const link = document.createElement('a');
  link.href = model.value;
  link.download = name.value || '附件文件';
  link.click();
}
</script>

<template>
  <div class="upload-file">
    <div v-if="model" class="upload-file__item">
      <el-icon><Document /></el-icon>
      <button class="upload-file__name" type="button" @click="downloadFile">
        {{ name || '附件文件' }}
      </button>
      <button
        v-if="!props.disabled"
        class="upload-file__remove"
        type="button"
        @click="handleRemove"
      >
        x
      </button>
    </div>

    <el-upload
      v-else
      v-bind="$attrs"
      drag
      :auto-upload="false"
      :limit="1"
      :accept="props.accept"
      :disabled="props.disabled || uploading"
      :show-file-list="false"
      :on-change="handleChange"
    >
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">{{ props.dragText }}</div>
    </el-upload>
    <div v-if="error" class="upload-file__error">{{ error }}</div>
  </div>
</template>

<style scoped>
.upload-file {
  width: 100%;
}

.upload-file__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  color: #606266;
  background-color: #f5f7fa;
}

.upload-file__name {
  max-width: 320px;
  overflow: hidden;
  border: 0;
  color: #409eff;
  background: transparent;
  cursor: pointer;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-file__remove {
  border: 0;
  color: #909399;
  background: transparent;
  cursor: pointer;
}

.upload-file__error {
  margin-top: 4px;
  color: #f56c6c;
  font-size: 12px;
  line-height: 1.2;
}
</style>
