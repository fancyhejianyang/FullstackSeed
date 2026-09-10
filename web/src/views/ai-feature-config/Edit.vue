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

type AiFeatureConfigEditForm = AiFeatureConfigForm & {
  thinkingParametersText: string;
};

const form = reactive<AiFeatureConfigEditForm>({
  name: '',
  featureType: 'chat',
  providerId: '',
  model: '',
  enableThinking: false,
  thinkingParameters: null,
  thinkingParametersText: '',
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
const isChatFeature = computed(() => form.featureType === 'chat');

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
      hint:
        form.featureType === 'chat'
          ? '当前为聊天：所选模型负责生成对话与知识库问答的最终回复。'
          : form.featureType === 'embedding'
            ? '当前为向量化：所选模型只负责把文本转换为向量，不能直接对话。'
            : form.featureType === 'ocr'
              ? '当前为 OCR：用于从图片或扫描件识别文字。'
              : '当前为文档解析：用于将文件转换为可切分、可索引的结构化文本。',
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
      hint: form.useMineru
        ? '当前使用 MinerU：由所选 MinerU 配置异步解析文档，不需要再选择大模型账号。'
        : '当前使用模型解析：由大模型账号直接处理，需要选择与该功能兼容的模型。',
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

  if (isChatFeature.value) {
    baseFields.push({
      prop: 'enableThinking',
      label: 'Think 模式',
      component: 'Switch',
      componentProps: { activeText: '开启', inactiveText: '关闭' },
      hint: form.enableThinking
        ? '当前开启：推理模型会先进行内部思考，复杂任务通常更稳，但响应更慢、成本更高。'
        : '当前关闭：直接生成回复，延迟与消耗更低。',
    });
    if (form.enableThinking) {
      baseFields.push({
        prop: 'thinkingParametersText',
        label: 'Think 参数',
        type: 'textarea',
        rows: 5,
        placeholder:
          'JSON 对象。例如 Qwen：{\n  "enable_thinking": true\n}\n或推理模型：{\n  "reasoning_effort": "medium"\n}',
      });
    }
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
      hint:
        form.responseFormat === 'json'
          ? '当前要求 JSON：适合被程序解析，提示词中应明确字段结构并避免附加说明。'
          : form.responseFormat === 'markdown'
            ? '当前要求 Markdown：适合保留标题、列表、表格等富文本结构。'
            : '当前返回普通文本：兼容性最好，适合一般对话和简短结果。',
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
    if (!isChatFeature.value) {
      form.enableThinking = false;
      form.thinkingParametersText = '';
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
  form.enableThinking = false;
  form.thinkingParametersText = '';
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
  form.enableThinking = !!data.enableThinking;
  form.thinkingParametersText = data.thinkingParameters
    ? JSON.stringify(data.thinkingParameters, null, 2)
    : '';
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
    enableThinking: isChatFeature.value && !!form.enableThinking,
    thinkingParameters: resolveThinkingParameters(),
    useMineru: !!form.useMineru,
    mineruConfigId: isMineruParseFeature.value ? Number(form.mineruConfigId) : null,
    systemPrompt: form.systemPrompt?.trim(),
    rules: form.rules?.trim(),
    responseFormat: form.responseFormat,
    isEnabled: form.isEnabled,
    description: form.description?.trim(),
  };
}

function resolveThinkingParameters() {
  if (!isChatFeature.value || !form.enableThinking) return null;
  const text = form.thinkingParametersText.trim();
  if (!text) {
    throw new Error('启用 Think 模式时，请填写 Think 参数 JSON 对象');
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Think 参数必须是 JSON 对象，例如 {"enable_thinking":true}');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Think 参数不是合法的 JSON 对象');
    }
    throw error;
  }
}

async function handleSubmit() {
  await formRef.value?.validate();
  let payload: AiFeatureConfigForm;
  try {
    payload = buildPayload();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'Think 参数配置不正确');
    return;
  }
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateAiFeatureConfig(props.row.id, payload);
      ElMessage.success('更新成功');
    } else {
      await createAiFeatureConfig(payload);
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
