<script setup lang="ts">
/**
 * UploadImage — 单图片上传回显组件。
 *
 * 核心能力：
 * - v-model 保存后端返回的图片 URL，业务表只需要存这个地址
 * - 默认调用统一上传接口，后端未来切 OSS 时不影响组件和业务字段
 * - 可通过 `uploadRequest` 覆盖上传实现，适配直传或特殊业务
 * - 默认限制单图、图片类型和大小
 * - el-upload attrs 透传，保留 Element Plus 原生扩展空间
 */
import { computed, ref } from 'vue';
import type { UploadFile, UploadUserFile } from 'element-plus';
import { UploadFilled } from '@element-plus/icons-vue';
import { uploadFile, type UploadResult } from '@/api/upload';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    accept?: string;
    maxSizeMb?: number;
    disabled?: boolean;
    uploadRequest?: (file: File) => Promise<UploadResult>;
  }>(),
  {
    accept: 'image/*',
    maxSizeMb: 5,
    disabled: false,
  },
);

const model = defineModel<string | null>({ default: '' });
const fileName = ref('图片');
const error = ref('');
const uploading = ref(false);

const emit = defineEmits<{
  change: [value: string | null, file?: UploadFile];
  remove: [];
}>();

const fileList = computed<UploadUserFile[]>(() =>
  model.value ? [{ name: fileName.value || '图片', url: model.value }] : [],
);

async function handleChange(file: UploadFile) {
  error.value = '';
  if (!file.raw) return;
  if (props.maxSizeMb && file.raw.size > props.maxSizeMb * 1024 * 1024) {
    error.value = `图片不能超过 ${props.maxSizeMb}MB`;
    return;
  }
  uploading.value = true;
  try {
    const result = await (props.uploadRequest ?? uploadFile)(file.raw);
    fileName.value = result.originalName || file.name;
    model.value = result.url;
    emit('change', result.url, file);
  } finally {
    uploading.value = false;
  }
}

function handleRemove() {
  model.value = '';
  fileName.value = '图片';
  error.value = '';
  emit('remove');
  emit('change', '');
}

</script>

<template>
  <div class="upload-image">
    <el-upload
      v-bind="$attrs"
      list-type="picture-card"
      :auto-upload="false"
      :limit="1"
      :file-list="fileList"
      :accept="props.accept"
      :disabled="props.disabled || uploading"
      :on-change="handleChange"
      :on-remove="handleRemove"
    >
      <el-icon><UploadFilled /></el-icon>
    </el-upload>
    <div v-if="error" class="upload-image__error">{{ error }}</div>
  </div>
</template>

<style scoped>
.upload-image__error {
  margin-top: 4px;
  color: #f56c6c;
  font-size: 12px;
  line-height: 1.2;
}
</style>
