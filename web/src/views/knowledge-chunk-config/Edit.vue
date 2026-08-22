<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  createKnowledgeChunkConfig,
  getKnowledgeChunkConfig,
  updateKnowledgeChunkConfig,
  type KnowledgeChunkConfig,
  type KnowledgeChunkConfigForm,
  type KnowledgeChunkMode,
  type KnowledgeChunkSeparator,
} from '@/api/knowledgeChunkConfig';

const props = defineProps<{
  row?: KnowledgeChunkConfig | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });
const formRef = ref<InstanceType<typeof Form>>();
const loading = ref(false);
const submitting = ref(false);

type ChunkConfigFormState = {
  name: string;
  chunkMode: KnowledgeChunkMode;
  chunkSize: number;
  chunkOverlap: number;
  timeoutMinutes: number;
  pdfOcrMaxPages: number;
  manualMaxChunks: number;
  separator: KnowledgeChunkSeparator;
  preserveHeading: boolean;
  isDefault: boolean;
  isEnabled: boolean;
};

const form = reactive<ChunkConfigFormState>({
  name: '',
  chunkMode: 'auto',
  chunkSize: 1200,
  chunkOverlap: 120,
  timeoutMinutes: 5,
  pdfOcrMaxPages: 8,
  manualMaxChunks: 500,
  separator: 'length',
  preserveHeading: true,
  isDefault: false,
  isEnabled: true,
});

const separatorOptions = [
  { value: 'length', label: '定长切分' },
  { value: 'paragraph', label: '段落优先' },
];

const chunkModeOptions = [
  { value: 'auto', label: 'MinerU/自动' },
  { value: 'manual', label: '手动' },
];

const fields = computed<FormField[]>(() => [
  { prop: 'name', label: '配置名称', type: 'input', placeholder: '如 默认自动分片' },
  {
    prop: 'chunkMode',
    label: '分片模式',
    type: 'select',
    options: chunkModeOptions,
  },
  ...(form.chunkMode === 'auto'
    ? ([
        {
          prop: 'chunkSize',
          label: '分片大小',
          component: 'InputNumber',
          componentProps: { mode: 'integer', min: 100, max: 10000, precision: 0 },
        },
      ] as FormField[])
    : []),
  {
    prop: 'chunkOverlap',
    label: form.chunkMode === 'manual' ? '上下文重叠' : '分片重叠',
    component: 'InputNumber',
    componentProps: { mode: 'integer', min: 0, max: 3000, precision: 0 },
  },
  ...(form.chunkMode === 'auto'
    ? ([
        {
          prop: 'timeoutMinutes',
          label: '超时时间',
          component: 'InputNumber',
          componentProps: { mode: 'integer', min: 1, max: 1440, precision: 0, suffixText: '分钟' },
        },
        {
          prop: 'separator',
          label: '切分方式',
          type: 'select',
          options: separatorOptions,
        },
        {
          prop: 'preserveHeading',
          label: '保留标题',
          component: 'Switch',
          componentProps: { activeText: '保留', inactiveText: '关闭' },
        },
      ] as FormField[])
    : []),
  ...(form.chunkMode === 'manual'
    ? ([
        {
          prop: 'pdfOcrMaxPages',
          label: 'PDF OCR页数',
          component: 'InputNumber',
          componentProps: { mode: 'integer', min: 1, max: 200, precision: 0, suffixText: '页' },
        },
        {
          prop: 'manualMaxChunks',
          label: '手动分片上限',
          component: 'InputNumber',
          componentProps: { mode: 'integer', min: 1, max: 10000, precision: 0, suffixText: '条' },
        },
      ] as FormField[])
    : []),
  {
    prop: 'isDefault',
    label: '默认配置',
    component: 'Switch',
    componentProps: { activeText: '默认', inactiveText: '普通' },
  },
  {
    prop: 'isEnabled',
    label: '是否启用',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
]);

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  chunkMode: [{ required: true, message: '请选择分片模式', trigger: 'change' }],
  ...(form.chunkMode === 'auto'
    ? {
        chunkSize: [{ required: true, message: '请输入分片大小', trigger: 'blur' }],
        timeoutMinutes: [{ required: true, message: '请输入超时时间', trigger: 'blur' }],
        separator: [{ required: true, message: '请选择切分方式', trigger: 'change' }],
      }
    : {}),
  chunkOverlap: [{ required: true, message: '请输入分片重叠', trigger: 'blur' }],
  ...(form.chunkMode === 'manual'
    ? {
        pdfOcrMaxPages: [{ required: true, message: '请输入 PDF OCR 页数', trigger: 'blur' }],
        manualMaxChunks: [{ required: true, message: '请输入手动分片上限', trigger: 'blur' }],
      }
    : {}),
}));

watch(visible, async (value) => {
  if (!value) return;
  if (!props.row?.id) {
    resetForm();
    return;
  }
  loading.value = true;
  try {
    fillForm(await getKnowledgeChunkConfig(props.row.id));
  } catch {
    // 详情加载失败：request 拦截器已统一弹错，这里仅兜底避免未处理异常
  } finally {
    loading.value = false;
  }
});

function resetForm() {
  form.name = '';
  form.chunkMode = 'auto';
  form.chunkSize = 1200;
  form.chunkOverlap = 120;
  form.timeoutMinutes = 5;
  form.pdfOcrMaxPages = 8;
  form.manualMaxChunks = 500;
  form.separator = 'length';
  form.preserveHeading = true;
  form.isDefault = false;
  form.isEnabled = true;
}

function fillForm(data: KnowledgeChunkConfig) {
  form.name = data.name ?? '';
  form.chunkMode = data.chunkMode ?? 'auto';
  form.chunkSize = Number(data.chunkSize ?? 1200);
  form.chunkOverlap = Number(data.chunkOverlap ?? 120);
  form.timeoutMinutes = Number(data.timeoutMinutes ?? 5);
  form.pdfOcrMaxPages = Number(data.pdfOcrMaxPages ?? 8);
  form.manualMaxChunks = Number(data.manualMaxChunks ?? 500);
  form.separator = data.separator ?? 'length';
  form.preserveHeading = !!data.preserveHeading;
  form.isDefault = !!data.isDefault;
  form.isEnabled = !!data.isEnabled;
}

function buildPayload(): KnowledgeChunkConfigForm {
  return {
    name: form.name.trim(),
    chunkMode: form.chunkMode,
    chunkSize: Number(form.chunkSize),
    chunkOverlap: Number(form.chunkOverlap),
    timeoutMinutes: Number(form.timeoutMinutes),
    pdfOcrMaxPages: Number(form.pdfOcrMaxPages),
    manualMaxChunks: Number(form.manualMaxChunks),
    separator: form.separator,
    preserveHeading: form.preserveHeading,
    isDefault: form.isDefault,
    isEnabled: form.isEnabled,
  };
}

async function handleSubmit() {
  const formEl = formRef.value;
  if (!formEl) return;
  try {
    // el-form validate() 校验失败会 reject，这里捕获后直接中断，避免未处理异常
    await formEl.validate();
  } catch {
    return;
  }
  const payload = buildPayload();
  // required 校验不拦截纯空格，trim 后二次校验，避免提交空名称
  if (!payload.name) {
    ElMessage.warning('请输入配置名称');
    return;
  }
  if (
    form.chunkMode === 'auto' &&
    Number(form.chunkOverlap) >= Number(form.chunkSize)
  ) {
    ElMessage.warning('分片重叠必须小于分片大小');
    return;
  }
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateKnowledgeChunkConfig(props.row.id, payload);
      ElMessage.success('更新成功');
    } else {
      await createKnowledgeChunkConfig(payload);
      ElMessage.success('创建成功');
    }
    visible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model="visible"
    :title="props.row ? '编辑分片配置' : '新增分片配置'"
    width="760px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="110px"
      />
    </div>
  </Dialog>
</template>
