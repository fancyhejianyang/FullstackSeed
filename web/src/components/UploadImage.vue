<script setup lang="ts">
/**
 * UploadImage — 单图片上传回显组件。
 *
 * 核心能力：
 * - v-model 保存图片 dataURL，适合当前种子项目的本地预览/表单回显场景
 * - 默认限制单图、图片类型和大小；不内置后端上传 API
 * - 如需真实上传，可在 change 事件里接 file.raw 后自行调用业务接口
 * - el-upload attrs 透传，保留 Element Plus 原生扩展空间
 */
import { computed, ref } from 'vue';
import type { UploadFile, UploadUserFile } from 'element-plus';
import { UploadFilled } from '@element-plus/icons-vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    accept?: string;
    maxSizeMb?: number;
    disabled?: boolean;
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
  const url = await readFileAsDataUrl(file);
  fileName.value = file.name;
  model.value = url;
  emit('change', url, file);
}

function handleRemove() {
  model.value = '';
  fileName.value = '图片';
  error.value = '';
  emit('remove');
  emit('change', '');
}

function readFileAsDataUrl(file: UploadFile) {
  // 当前组件只负责本地预览值；真实文件上传交给业务接口，不在通用组件内耦合 API。
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
  <div class="upload-image">
    <el-upload
      v-bind="$attrs"
      list-type="picture-card"
      :auto-upload="false"
      :limit="1"
      :file-list="fileList"
      :accept="props.accept"
      :disabled="props.disabled"
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
