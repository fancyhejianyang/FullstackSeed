<script setup lang="ts">
import type { UploadFile } from 'element-plus';
import { Document, UploadFilled } from '@element-plus/icons-vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    accept?: string;
    maxSizeMb?: number;
    disabled?: boolean;
    dragText?: string;
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

const emit = defineEmits<{
  change: [value: string | null, fileName: string, file?: UploadFile];
  remove: [];
}>();

async function handleChange(file: UploadFile) {
  if (!file.raw) return;
  if (props.maxSizeMb && file.raw.size > props.maxSizeMb * 1024 * 1024) return;
  const url = await readFileAsDataUrl(file);
  name.value = file.name;
  model.value = url;
  emit('change', url, file.name, file);
}

function handleRemove() {
  name.value = '';
  model.value = '';
  emit('remove');
  emit('change', '', '');
}

function downloadFile() {
  if (!model.value) return;
  const link = document.createElement('a');
  link.href = model.value;
  link.download = name.value || '附件文件';
  link.click();
}

function readFileAsDataUrl(file: UploadFile) {
  return new Promise<string>((resolve, reject) => {
    if (!file.raw) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file.raw);
  });
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
      :disabled="props.disabled"
      :show-file-list="false"
      :on-change="handleChange"
    >
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">{{ props.dragText }}</div>
    </el-upload>
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
</style>
