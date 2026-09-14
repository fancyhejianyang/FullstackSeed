<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
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
  validateKnowledgeAiProviderModel,
  type KnowledgeAiProvider,
} from '@/api/knowledgeAiProvider';
import { getMineruConfigs, type MineruConfig } from '@/api/mineruConfig';

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
const formReadyForModelValidation = ref(false);
const validatingModel = ref(false);
const modelValidationHint = ref('');
let modelValidationSequence = 0;

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
  temperature: 0.2,
  responseFormat: 'text',
  isEnabled: true,
  description: '',
});

const featureTypeOptions = [
  { label: '聊天', value: 'chat' },
  { label: '文档解析', value: 'documentParse' },
  { label: 'OCR', value: 'ocr' },
  { label: 'LLM 重排', value: 'rerank' },
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

const isParseFeature = computed(() =>
  ['ocr', 'documentParse'].includes(form.featureType),
);
const isOcrFeature = computed(() => form.featureType === 'ocr');
const isMineruOcrFeature = computed(
  () => isOcrFeature.value && !!form.useMineru,
);
const isChatFeature = computed(() => form.featureType === 'chat');
const isRerankFeature = computed(() => form.featureType === 'rerank');
const isStructuredParseFeature = computed(() => isParseFeature.value);
const usesTemperature = computed(
  () => !isMineruOcrFeature.value && !isRerankFeature.value,
);
const usesPromptSettings = computed(
  () => !isMineruOcrFeature.value && !isRerankFeature.value,
);

const modelOptions = computed(() =>
  getModelOptions(selectedProvider.value, form.featureType),
);

const modelPlaceholder = computed(() => {
  if (form.featureType === 'ocr') return '请选择视觉模型';
  if (form.featureType === 'rerank') return '请选择用于重排的通用文本模型';
  return '请选择模型';
});

const fields = computed<FormField[]>(() => {
  const baseFields: FormField[] = [
    {
      prop: 'name',
      label: '配置名称',
      type: 'input',
      placeholder: '如 聊天默认配置',
    },
    {
      prop: 'featureType',
      label: '功能类型',
      type: 'select',
      options: featureTypeOptions,
      hint:
        form.featureType === 'chat'
          ? '当前为聊天：所选模型负责生成对话与知识库问答的最终回复。'
          : form.featureType === 'rerank'
            ? '当前为 LLM 重排：模型只给召回的知识片段评分和排序，不参与最终回答。'
            : form.featureType === 'ocr'
              ? '当前为 OCR：仅处理图片或 PDF，可使用视觉模型或 MinerU 引擎。'
              : '当前为文档解析：仅处理文本/TXT/Word，由大模型按提示词整理为结构化 Markdown。',
    },
  ];

  if (isOcrFeature.value) {
    baseFields.push({
      prop: 'useMineru',
      label: 'OCR 引擎',
      component: 'Switch',
      componentProps: {
        activeText: 'MinerU 引擎',
        inactiveText: '视觉模型',
      },
      hint: form.useMineru
        ? '当前使用 MinerU：读取下方的 MinerU 引擎账号与参数，不使用视觉模型提示词。'
        : '当前使用视觉模型：适合图片/PDF 识别，可通过提示词约束 Markdown 结构。',
    });
  }

  if (isMineruOcrFeature.value) {
    baseFields.push({
      prop: 'mineruConfigId',
      label: 'MinerU 引擎配置',
      type: 'select',
      options: mineruConfigOptions,
      placeholder: '请选择 MinerU 引擎配置',
    });
  }

  if (!isMineruOcrFeature.value) {
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
        hint: validatingModel.value
          ? `正在校验“${form.model}”是否可用…`
          : modelValidationHint.value ||
            (isRerankFeature.value
              ? '请选择通用文本模型。系统会固定用温度 0 和内置 JSON 评分提示词调用它，不会生成最终回答。'
              : '切换模型后会自动调用账号接口校验；确认不存在时会从该账号模型列表中移除。'),
      },
    );
    if (usesTemperature.value) {
      baseFields.push({
        prop: 'temperature',
        label: '温度',
        component: 'InputNumber',
        componentProps: { min: 0, max: 2, precision: 2, step: 0.1 },
        hint:
          Number(form.temperature) <= 0.2
            ? `当前 ${form.temperature}：输出更稳定、可复现，适合客服、解析和结构化结果。`
            : Number(form.temperature) <= 0.8
              ? `当前 ${form.temperature}：稳定性与表达多样性较均衡，适合常规对话。`
              : `当前 ${form.temperature}：表达更发散、随机性更强，可能降低格式与事实的一致性。`,
      });
    }
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

  if (usesPromptSettings.value) {
    baseFields.push(
      {
        prop: 'systemPrompt',
        label: '提示词',
        type: 'textarea',
        rows: 5,
        placeholder: isStructuredParseFeature.value
          ? '可补充业务术语、标题规则或保留项；系统会固定追加 Markdown 结构化输出要求'
          : '该功能默认系统提示词，可被测试请求临时覆盖',
        hint: (() => {
          const prompt = form.systemPrompt?.trim() ?? '';
          if (isStructuredParseFeature.value) {
            return prompt
              ? `当前已填写 ${prompt.length} 个字符；系统会在其后固定追加 Markdown、标题层级、列表与表格保留规则。`
              : '系统会固定要求 Markdown 输出；此处仅补充业务术语、标题规则或必须保留的内容。';
          }
          return prompt
            ? `当前已填写 ${prompt.length} 个字符；业务规则、口吻和禁止项请直接写在此提示词中。`
            : '未填写时将使用系统默认提示词；业务规则、口吻和禁止项请直接写在此处。';
        })(),
      },
      {
        prop: 'responseFormat',
        label: '返回格式',
        type: 'select',
        options: isStructuredParseFeature.value
          ? [{ label: 'Markdown（固定）', value: 'markdown' }]
          : [
              { label: '文本', value: 'text' },
              { label: 'JSON', value: 'json' },
              { label: 'Markdown', value: 'markdown' },
            ],
        componentProps: isStructuredParseFeature.value
          ? { disabled: true }
          : undefined,
        hint: isStructuredParseFeature.value
          ? '文档解析固定输出 Markdown，以保留标题、列表、表格等结构并支持章节分片。'
          : form.responseFormat === 'json'
            ? '当前要求 JSON：适合被程序解析，提示词中应明确字段结构并避免附加说明。'
            : form.responseFormat === 'markdown'
              ? '当前要求 Markdown：适合保留标题、列表、表格等富文本结构。'
              : '当前返回普通文本：兼容性最好，适合一般对话和简短结果。',
      },
    );
  }

  return [
    ...baseFields,
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
  featureType: [
    { required: true, message: '请选择功能类型', trigger: 'change' },
  ],
  ...(isMineruOcrFeature.value
    ? {
        mineruConfigId: [
          { required: true, message: '请选择 MinerU 引擎配置', trigger: 'change' },
        ],
      }
    : {
        providerId: [
          { required: true, message: '请选择大模型账号', trigger: 'change' },
        ],
        model: [{ required: true, message: '请选择模型', trigger: 'change' }],
      }),
  ...(usesTemperature.value
    ? {
        temperature: [
          { required: true, message: '请输入温度', trigger: 'blur' },
        ],
      }
    : {}),
}));

watch(visible, async (value) => {
  if (!value) return;
  formReadyForModelValidation.value = false;
  modelValidationHint.value = '';
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
    await nextTick();
    formReadyForModelValidation.value = true;
  }
});

watch(
  () => [
    form.featureType,
    form.providerId,
    form.useMineru,
    providers.value.length,
  ],
  () => {
    modelValidationSequence += 1;
    validatingModel.value = false;
    modelValidationHint.value = '';
    if (!isOcrFeature.value) {
      form.useMineru = false;
      form.mineruConfigId = '';
    }
    if (!isChatFeature.value) {
      form.enableThinking = false;
      form.thinkingParametersText = '';
    }
    if (isRerankFeature.value) {
      form.systemPrompt = '';
      form.temperature = 0;
      form.responseFormat = 'json';
    }
    if (isStructuredParseFeature.value) {
      form.responseFormat = 'markdown';
    }
    if (isMineruOcrFeature.value) {
      form.providerId = '';
      form.model = '';
      return;
    }
    form.mineruConfigId = '';
    const options = modelOptions.value;
    if (
      selectedProvider.value &&
      !options.some((item) => item.value === form.model)
    ) {
      form.model = '';
    }
  },
);

watch(
  () =>
    [form.model, form.providerId, form.featureType, form.useMineru] as const,
  () => {
    if (
      !formReadyForModelValidation.value ||
      isMineruOcrFeature.value ||
      !form.providerId ||
      !form.model
    ) {
      return;
    }
    void validateSelectedModel();
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
  form.temperature = 0.2;
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
  form.temperature = Number(data.temperature ?? 0.2);
  form.responseFormat = data.responseFormat ?? 'text';
  form.isEnabled = !!data.isEnabled;
  form.description = data.description ?? '';
}

function buildPayload(): AiFeatureConfigForm {
  return {
    name: form.name.trim(),
    featureType: form.featureType,
    providerId: isMineruOcrFeature.value ? null : Number(form.providerId),
    model: isMineruOcrFeature.value ? '' : form.model?.trim(),
    enableThinking: isChatFeature.value && !!form.enableThinking,
    thinkingParameters: resolveThinkingParameters(),
    useMineru: isMineruOcrFeature.value,
    mineruConfigId: isMineruOcrFeature.value
      ? Number(form.mineruConfigId)
      : null,
    systemPrompt: isRerankFeature.value ? '' : form.systemPrompt?.trim(),
    temperature: isRerankFeature.value ? 0 : Number(form.temperature),
    responseFormat: isRerankFeature.value
      ? 'json'
      : isStructuredParseFeature.value
        ? 'markdown'
        : form.responseFormat,
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
      throw new Error(
        'Think 参数必须是 JSON 对象，例如 {"enable_thinking":true}',
      );
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
    ElMessage.error(
      error instanceof Error ? error.message : 'Think 参数配置不正确',
    );
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

function getModelText(
  provider: KnowledgeAiProvider | undefined,
  featureType: AiFeatureType,
) {
  if (!provider) return '';
  if (
    featureType === 'chat' ||
    featureType === 'documentParse' ||
    featureType === 'rerank'
  ) {
    return joinModelTexts(provider.models, provider.textModels);
  }
  if (featureType === 'ocr') {
    return joinModelTexts(provider.visionModels, provider.models);
  }
  return '';
}

async function validateSelectedModel() {
  const providerId = Number(form.providerId);
  const model = form.model?.trim() ?? '';
  if (!providerId || !model) return;
  const requestSequence = ++modelValidationSequence;
  validatingModel.value = true;
  modelValidationHint.value = '';
  try {
    const result = await validateKnowledgeAiProviderModel({
      id: providerId,
      model,
      featureType: form.featureType,
    });
    if (requestSequence !== modelValidationSequence) return;
    providers.value = providers.value.map((item) =>
      item.id === result.provider.id ? result.provider : item,
    );
    if (result.isAvailable) {
      modelValidationHint.value = `“${model}”已通过当前账号可用性校验。`;
      return;
    }
    modelValidationHint.value =
      result.errorMessage || `“${model}”暂时无法校验。`;
    if (result.removed) {
      form.model = '';
      ElMessage.warning(
        result.disabledConfigCount
          ? `模型“${model}”已从账号列表移除，并停用了 ${result.disabledConfigCount} 个关联配置。`
          : `模型“${model}”已从账号列表移除，请重新选择可用模型。`,
      );
    }
  } catch {
    if (requestSequence === modelValidationSequence) {
      modelValidationHint.value = `“${model}”校验请求失败，请检查账号网络、密钥或模型授权。`;
    }
  } finally {
    if (requestSequence === modelValidationSequence) {
      validatingModel.value = false;
    }
  }
}

function getModelOptions(
  provider: KnowledgeAiProvider | undefined,
  featureType: AiFeatureType,
) {
  const seen = new Set<string>();
  return parseModelText(getModelText(provider, featureType))
    .filter((item) => {
      if (seen.has(item.code)) return false;
      seen.add(item.code);
      return true;
    })
    .map((item) => ({
      label:
        item.name === item.code ? item.code : `${item.name} (${item.code})`,
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
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="110px"
      />
      <div v-if="isRerankFeature" class="ai-feature-config-edit__rerank-tip">
        LLM 重排固定以温度 0 和 JSON 评分格式执行，系统会把“用户问题 +
        初步召回片段”交给所选模型重新排序；聊天提示词、Think
        和返回格式均不适用于此类型。
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.ai-feature-config-edit__rerank-tip {
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}
</style>
