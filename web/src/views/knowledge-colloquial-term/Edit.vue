<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  createKnowledgeColloquialTerm,
  getKnowledgeColloquialTerm,
  knowledgeColloquialMatchModeOptions,
  knowledgeColloquialSemanticTypeOptions,
  updateKnowledgeColloquialTerm,
  type KnowledgeColloquialMatchMode,
  type KnowledgeColloquialSemanticType,
  type KnowledgeColloquialTerm,
  type KnowledgeColloquialTermForm,
} from '@/api/knowledgeColloquialTerm';
import {
  getKnowledgeRetrievalConfigs,
  type KnowledgeRetrievalConfig,
} from '@/api/knowledgeRetrievalConfig';

const props = defineProps<{
  row?: KnowledgeColloquialTerm | null;
}>();

const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>('visible', { required: true });
const formRef = ref<InstanceType<typeof Form>>();
const loading = ref(false);
const submitting = ref(false);
const retrievalConfigs = ref<KnowledgeRetrievalConfig[]>([]);

type ColloquialTermEditForm = {
  term: string;
  replacement: string;
  semanticType: KnowledgeColloquialSemanticType;
  semanticDefinition: string;
  answerUnit: string;
  retrievalConfigId: number | '';
  matchMode: KnowledgeColloquialMatchMode;
  excludePhrasesText: string;
  isEnabled: boolean;
};

const form = reactive<ColloquialTermEditForm>({
  term: '',
  replacement: '',
  semanticType: 'custom',
  semanticDefinition: '',
  answerUnit: '',
  retrievalConfigId: '',
  matchMode: 'contains',
  excludePhrasesText: '',
  isEnabled: true,
});

const selectedRetrievalConfig = computed(() =>
  retrievalConfigs.value.find((item) => item.id === Number(form.retrievalConfigId)),
);

const retrievalConfigOptions = computed(() => [
  { label: '全局生效', value: '' },
  ...retrievalConfigs.value.map((item) => ({ label: item.name, value: item.id })),
]);

const semanticTypeHint = computed(() => {
  if (form.semanticType === 'product-alias') {
    return '产品简称：把口头简称替换成正式产品名，例如“小蓝” → “蓝虎机器人 Pro”。';
  }
  if (form.semanticType === 'attribute') {
    return '属性 / 指标：明确用户在问的业务属性，例如“多重”指“物品质量 / 重量”。';
  }
  if (form.semanticType === 'business-term') {
    return '业务术语：把口语说法统一为业务、制度或产品中的标准术语。';
  }
  return '自定义表达：用于不属于以上分类、但需要统一理解和改写的口语表达。';
});

const replacementHint = computed(() => {
  const term = form.term.trim() || '口语表达';
  const replacement = form.replacement.trim();
  if (!replacement) {
    return '填写替换后的标准文本；多条词条可以依次组合成一个适合标准问答和知识库检索的问题。';
  }
  return `当前命中“${term}”后会替换为“${replacement}”。例如“小蓝多重”可组合为“蓝虎机器人 Pro 的重量是多少？”。`;
});

const fields = computed<FormField[]>(() => [
  {
    prop: 'term',
    label: '口语表达',
    type: 'input',
    placeholder: '如 小蓝、多重、能不能报销',
    hint: '填写用户实际可能说出的词或短语；同义说法请分别建词条，避免依赖模型猜测。',
  },
  {
    prop: 'replacement',
    label: '标准替换文本',
    type: 'textarea',
    rows: 2,
    placeholder: '如 蓝虎机器人 Pro 或 的重量是多少？',
    hint: replacementHint.value,
  },
  {
    prop: 'semanticType',
    label: '表达类型',
    type: 'select',
    options: knowledgeColloquialSemanticTypeOptions.map((item) => ({ ...item })),
    hint: semanticTypeHint.value,
  },
  {
    prop: 'semanticDefinition',
    label: '语义解释',
    type: 'textarea',
    rows: 3,
    placeholder: '如 此处“多重”询问物品质量 / 重量，不是“多重因素”等抽象含义',
    hint: '该说明会作为人工维护的术语约束传给检索和回答模型，帮助避免跑偏；它不会被当作事实答案。',
  },
  {
    prop: 'answerUnit',
    label: '推荐单位',
    type: 'input',
    placeholder: '如 kg、g',
    hint: form.answerUnit.trim()
      ? `当前推荐以“${form.answerUnit.trim()}”为单位表达；模型仍须以知识库事实为准。`
      : '可选。填写回答该属性时的推荐单位，例如重量用 kg 或 g。',
  },
  {
    prop: 'retrievalConfigId',
    label: '适用检索配置',
    type: 'select',
    options: retrievalConfigOptions.value,
    hint: selectedRetrievalConfig.value
      ? `当前只在“${selectedRetrievalConfig.value.name}”检索时生效。`
      : '当前全局生效：所有知识库检索配置都可使用该表达。',
  },
  {
    prop: 'matchMode',
    label: '匹配方式',
    type: 'select',
    options: knowledgeColloquialMatchModeOptions.map((item) => ({ ...item })),
    hint:
      form.matchMode === 'exact'
        ? '当前为精确匹配：只有整个用户问题与口语表达一致才替换，触发更谨慎。'
        : '当前为包含匹配：问题中出现该词就替换，适合产品简称、属性词等可组合表达。',
  },
  {
    prop: 'excludePhrasesText',
    label: '排除短语',
    type: 'textarea',
    rows: 2,
    placeholder: '一行一个，如 多重因素',
    hint: form.excludePhrasesText.trim()
      ? '用户问题包含任一排除短语时，本词条不会生效，可降低同形异义误改写。'
      : '可选。用于排除同形异义，例如“多重”排除“多重因素”。',
  },
  {
    prop: 'isEnabled',
    label: '是否启用',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
    hint: form.isEnabled ? '当前会参与问题改写。' : '当前已停用，不会影响标准问答或知识库检索。',
  },
]);

const rules = computed<FormRules>(() => ({
  term: [{ required: true, message: '请输入口语表达', trigger: 'blur' }],
  replacement: [{ required: true, message: '请输入标准替换文本', trigger: 'blur' }],
  semanticType: [{ required: true, message: '请选择表达类型', trigger: 'change' }],
  semanticDefinition: [{ required: true, message: '请输入语义解释', trigger: 'blur' }],
}));

watch(visible, async (value) => {
  if (!value) return;
  loading.value = true;
  try {
    const result = await getKnowledgeRetrievalConfigs({ page: 1, pageSize: 500 });
    retrievalConfigs.value = result.list;
    if (props.row?.id) {
      fillForm(await getKnowledgeColloquialTerm(props.row.id));
    } else {
      resetForm();
    }
  } finally {
    loading.value = false;
  }
});

function resetForm() {
  form.term = '';
  form.replacement = '';
  form.semanticType = 'custom';
  form.semanticDefinition = '';
  form.answerUnit = '';
  form.retrievalConfigId = '';
  form.matchMode = 'contains';
  form.excludePhrasesText = '';
  form.isEnabled = true;
}

function fillForm(data: KnowledgeColloquialTerm) {
  form.term = data.term ?? '';
  form.replacement = data.replacement ?? '';
  form.semanticType = data.semanticType;
  form.semanticDefinition = data.semanticDefinition ?? '';
  form.answerUnit = data.answerUnit ?? '';
  form.retrievalConfigId = data.retrievalConfigId ?? '';
  form.matchMode = data.matchMode ?? 'contains';
  form.excludePhrasesText = (data.excludePhrases ?? []).join('\n');
  form.isEnabled = !!data.isEnabled;
}

function splitTexts(value: string) {
  return Array.from(new Set(value.split(/[\r\n,，]/).map((item) => item.trim()).filter(Boolean)));
}

function buildPayload(): KnowledgeColloquialTermForm {
  return {
    term: form.term.trim(),
    replacement: form.replacement.trim(),
    semanticType: form.semanticType,
    semanticDefinition: form.semanticDefinition.trim(),
    answerUnit: form.answerUnit.trim() || null,
    retrievalConfigId: form.retrievalConfigId ? Number(form.retrievalConfigId) : null,
    matchMode: form.matchMode,
    excludePhrases: splitTexts(form.excludePhrasesText),
    isEnabled: form.isEnabled,
  };
}

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateKnowledgeColloquialTerm(props.row.id, buildPayload());
      ElMessage.success('口语表达已更新');
    } else {
      await createKnowledgeColloquialTerm(buildPayload());
      ElMessage.success('口语表达已创建');
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
    :title="props.row ? '编辑口语化表达' : '新增口语化表达'"
    width="820px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="120px" />
      <div class="knowledge-colloquial-term-edit__tip">
        执行顺序：先精确匹配原始标准问答；未命中时改写口语表达，再精确匹配标准问答；仍未命中才检索知识库。产品简称与属性词可组合改写，例如“小蓝多重” → “蓝虎机器人 Pro 的重量是多少？”。
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.knowledge-colloquial-term-edit__tip {
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}
</style>
