<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  createAiFeatureConfig,
  getAiFeatureConfig,
  updateAiFeatureConfig,
  type AiFeatureConfig,
  type AiFeatureConfigForm,
  type AiFeatureType,
} from '@/api/aiFeatureConfig';
import {
  getKnowledgeAiProviders,
  type KnowledgeAiProvider,
} from '@/api/knowledgeAiProvider';

const props = defineProps<{
  row?: AiFeatureConfig | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const providers = ref<KnowledgeAiProvider[]>([]);

const form = reactive<AiFeatureConfigForm>({
  name: '',
  featureType: 'chat',
  providerId: '',
  model: '',
  systemPrompt: '',
  rules: '',
  responseFormat: 'text',
  isEnabled: true,
  description: '',
});

const featureTypeOptions = [
  { label: '聊天', value: 'chat' },
  { label: '文档解析', value: 'documentParse' },
  { label: 'OCR', value: 'ocr' },
];

const providerOptions = computed(() =>
  providers.value.map((item) => ({
    label: item.name,
    value: item.id,
  })),
);

const selectedProvider = computed(() =>
  providers.value.find((item) => item.id === Number(form.providerId)),
);

const modelOptions = computed(() =>
  parseModelText(getModelText(selectedProvider.value, form.featureType)).map((item) => ({
    label: item.name,
    value: item.code,
  })),
);

const fields = computed<FormField[]>(() => [
  { prop: 'name', label: '配置名称', type: 'input', placeholder: '如 聊天默认配置' },
  {
    prop: 'featureType',
    label: '功能类型',
    type: 'select',
    options: featureTypeOptions,
  },
  {
    prop: 'providerId',
    label: '大模型账号',
    type: 'select',
    options: providerOptions,
  },
  {
    prop: 'model',
    label: '模型',
    type: 'select',
    options: modelOptions,
    placeholder: '请选择模型',
  },
  {
    prop: 'systemPrompt',
    label: '提示词',
    type: 'textarea',
    rows: 5,
    placeholder: '该功能默认系统提示词，可被测试请求临时覆盖',
  },
  {
    prop: 'rules',
    label: '规则',
    type: 'textarea',
    rows: 4,
    placeholder: '如温度、口吻、禁止输出内容等业务规则说明',
  },
  {
    prop: 'responseFormat',
    label: '返回格式',
    type: 'select',
    options: [
      { label: '文本', value: 'text' },
      { label: 'JSON', value: 'json' },
      { label: 'Markdown', value: 'markdown' },
    ],
  },
  {
    prop: 'isEnabled',
    label: '是否启用',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
  { prop: 'description', label: '描述', type: 'textarea', rows: 3 },
]);

const rules: FormRules = {
  name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  featureType: [{ required: true, message: '请选择功能类型', trigger: 'change' }],
  providerId: [{ required: true, message: '请选择大模型账号', trigger: 'change' }],
  model: [{ required: true, message: '请选择模型', trigger: 'change' }],
};

watch(visible, async (value) => {
  if (!value) return;
  loading.value = true;
  try {
    await fetchProviders();
    if (props.row?.id) {
      fillForm(await getAiFeatureConfig(props.row.id));
    } else {
      resetForm();
    }
  } finally {
    loading.value = false;
  }
});

watch(
  () => [form.featureType, form.providerId, providers.value.length],
  () => {
    const options = modelOptions.value;
    if (options.length && !options.some((item) => item.value === form.model)) {
      form.model = '';
    }
  },
);

async function fetchProviders() {
  const result = await getKnowledgeAiProviders({ page: 1, pageSize: 200 });
  providers.value = result.list;
}

function resetForm() {
  form.name = '';
  form.featureType = 'chat';
  form.providerId = '';
  form.model = '';
  form.systemPrompt = '';
  form.rules = '';
  form.responseFormat = 'text';
  form.isEnabled = true;
  form.description = '';
}

function fillForm(data: AiFeatureConfig) {
  form.name = data.name ?? '';
  form.featureType = data.featureType;
  form.providerId = data.providerId;
  form.model = data.model ?? '';
  form.systemPrompt = data.systemPrompt ?? '';
  form.rules = data.rules ?? '';
  form.responseFormat = data.responseFormat ?? 'text';
  form.isEnabled = !!data.isEnabled;
  form.description = data.description ?? '';
}

function buildPayload(): AiFeatureConfigForm {
  return {
    name: form.name.trim(),
    featureType: form.featureType,
    providerId: Number(form.providerId),
    model: form.model.trim(),
    systemPrompt: form.systemPrompt?.trim(),
    rules: form.rules?.trim(),
    responseFormat: form.responseFormat,
    isEnabled: form.isEnabled,
    description: form.description?.trim(),
  };
}

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateAiFeatureConfig(props.row.id, buildPayload());
      ElMessage.success('更新成功');
    } else {
      await createAiFeatureConfig(buildPayload());
      ElMessage.success('创建成功');
    }
    visible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
}

function getModelText(provider: KnowledgeAiProvider | undefined, featureType: AiFeatureType) {
  if (!provider) return '';
  if (featureType === 'chat') return provider.textModels || provider.models;
  if (featureType === 'ocr') return provider.visionModels || provider.models;
  return provider.textModels || provider.visionModels || provider.models;
}

function parseModelText(value: string) {
  return (value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [code, name] = line.split('#');
      const modelCode = code.trim();
      return {
        code: modelCode,
        name: (name || modelCode).trim(),
      };
    })
    .filter((item) => item.code);
}
</script>

<template>
  <Dialog
    v-model="visible"
    :title="props.row ? '编辑 AI 功能配置' : '新增 AI 功能配置'"
    width="860px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="110px" />
    </div>
  </Dialog>
</template>

