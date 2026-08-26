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
import {
  getMineruConfigs,
  type MineruConfig,
} from '@/api/mineruConfig';

const props = defineProps<{
  row?: AiFeatureConfig | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const providers = ref<KnowledgeAiProvider[]>([]);
const mineruConfigs = ref<MineruConfig[]>([]);

const form = reactive<AiFeatureConfigForm>({
  name: '',
  featureType: 'chat',
  providerId: '',
  model: '',
  useMineru: false,
  mineruConfigId: '',
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
  { label: '向量化', value: 'embedding' },
];

const providerOptions = computed(() =>
  providers.value.map((item) => ({
    label: item.name,
    value: item.id,
  })),
);

const mineruConfigOptions = computed(() =>
  mineruConfigs.value.map((item) => ({
    label: item.name,
    value: item.id,
  })),
);

const selectedProvider = computed(() =>
  providers.value.find((item) => item.id === Number(form.providerId)),
);

const isParseFeature = computed(() => ['ocr', 'documentParse'].includes(form.featureType));
const isMineruParseFeature = computed(() => isParseFeature.value && !!form.useMineru);

const modelOptions = computed(() => getModelOptions(selectedProvider.value, form.featureType));

const modelPlaceholder = computed(() => {
  if (form.featureType === 'ocr') return '请选择视觉模型';
  if (form.featureType === 'embedding') return '请选择向量模型';
  return '请选择模型';
});

const fields = computed<FormField[]>(() => {
  const baseFields: FormField[] = [
    { prop: 'name', label: '配置名称', type: 'input', placeholder: '如 聊天默认配置' },
    {
      prop: 'featureType',
      label: '功能类型',
      type: 'select',
      options: featureTypeOptions,
    },
  ];

  if (isParseFeature.value) {
    baseFields.push({
      prop: 'useMineru',
      label: form.featureType === 'ocr' ? 'OCR 引擎' : '解析引擎',
      component: 'Switch',
      componentProps: {
        activeText: 'MinerU',
        inactiveText: form.featureType === 'ocr' ? '视觉模型' : 'AI 模型',
      },
    });
  }

  if (isMineruParseFeature.value) {
    baseFields.push({
      prop: 'mineruConfigId',
      label: 'MinerU 配置',
      type: 'select',
      options: mineruConfigOptions,
      placeholder: '请选择 MinerU 配置',
    });
  }

  if (!isMineruParseFeature.value) {
    baseFields.push(
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
        placeholder: modelPlaceholder.value,
      },
    );
  }

  return [
    ...baseFields,
    {
      prop: 'systemPrompt',
      label: '提示词',
      type: 'textarea',
      rows: 5,
      placeholder: isMineruParseFeature.value
        ? '使用 MinerU 时可作为解析配置说明保留'
        : '该功能默认系统提示词，可被测试请求临时覆盖',
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
  ];
});

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  featureType: [{ required: true, message: '请选择功能类型', trigger: 'change' }],
  ...(isMineruParseFeature.value
    ? {
        mineruConfigId: [{ required: true, message: '请选择 MinerU 配置', trigger: 'change' }],
      }
    : {
        providerId: [{ required: true, message: '请选择大模型账号', trigger: 'change' }],
        model: [{ required: true, message: '请选择模型', trigger: 'change' }],
      }),
}));

watch(visible, async (value) => {
  if (!value) return;
  loading.value = true;
  try {
    await fetchOptions();
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
  () => [form.featureType, form.providerId, form.useMineru, providers.value.length],
  () => {
    if (!isParseFeature.value) {
      form.useMineru = false;
    }
    if (isMineruParseFeature.value) {
      form.providerId = '';
      form.model = '';
      return;
    }
    form.mineruConfigId = '';
    const options = modelOptions.value;
    if (selectedProvider.value && !options.some((item) => item.value === form.model)) {
      form.model = '';
    }
  },
);

async function fetchOptions() {
  const [providerResult, mineruResult] = await Promise.all([
    getKnowledgeAiProviders({ page: 1, pageSize: 200 }),
    getMineruConfigs({ page: 1, pageSize: 200 }),
  ]);
  providers.value = providerResult.list;
  mineruConfigs.value = mineruResult.list;
}

function resetForm() {
  form.name = '';
  form.featureType = 'chat';
  form.providerId = '';
  form.model = '';
  form.useMineru = false;
  form.mineruConfigId = '';
  form.systemPrompt = '';
  form.rules = '';
  form.responseFormat = 'text';
  form.isEnabled = true;
  form.description = '';
}

function fillForm(data: AiFeatureConfig) {
  form.name = data.name ?? '';
  form.featureType = data.featureType;
  form.providerId = data.providerId ?? '';
  form.model = data.model ?? '';
  form.useMineru = !!data.useMineru;
  form.mineruConfigId = data.mineruConfigId ?? '';
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
    providerId: isMineruParseFeature.value ? null : Number(form.providerId),
    model: isMineruParseFeature.value ? '' : form.model?.trim(),
    useMineru: !!form.useMineru,
    mineruConfigId: isMineruParseFeature.value ? Number(form.mineruConfigId) : null,
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
  if (featureType === 'chat') {
    return joinModelTexts(provider.models, provider.textModels);
  }
  if (featureType === 'ocr') {
    return provider.visionModels || '';
  }
  if (featureType === 'embedding') {
    return joinModelTexts(provider.embeddingModels, provider.models);
  }
  return joinModelTexts(provider.visionModels, provider.textModels, provider.models);
}

function getModelOptions(provider: KnowledgeAiProvider | undefined, featureType: AiFeatureType) {
  const seen = new Set<string>();
  return parseModelText(getModelText(provider, featureType))
    .filter((item) => {
      if (seen.has(item.code)) return false;
      seen.add(item.code);
      return true;
    })
    .map((item) => ({
      label: item.name === item.code ? item.code : `${item.name} (${item.code})`,
      value: item.code,
    }));
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

function joinModelTexts(...values: Array<string | null | undefined>) {
  // 账号的“模型列表”是通用池，功能模型是补充/精简池；这里合并后由 getModelOptions 去重。
  return values
    .map((item) => item?.trim())
    .filter(Boolean)
    .join('\n');
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
