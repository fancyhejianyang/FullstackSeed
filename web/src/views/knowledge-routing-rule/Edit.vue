<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  createKnowledgeRoutingRule,
  getKnowledgeRoutingRule,
  knowledgeRoutingMatchModeOptions,
  knowledgeRoutingRuleTypeOptions,
  updateKnowledgeRoutingRule,
  type KnowledgeRoutingMatchMode,
  type KnowledgeRoutingRule,
  type KnowledgeRoutingRuleForm,
  type KnowledgeRoutingRuleType,
} from '@/api/knowledgeRoutingRule';
import {
  getKnowledgeBases,
  getKnowledgeBaseDocuments,
  type KnowledgeBase,
  type KnowledgeBaseDocument,
} from '@/api/knowledgeBase';
import {
  getKnowledgeRetrievalConfigs,
  type KnowledgeRetrievalConfig,
} from '@/api/knowledgeRetrievalConfig';

const props = defineProps<{
  row?: KnowledgeRoutingRule | null;
}>();

const emit = defineEmits<{ success: [] }>();

type RoutingRuleEditForm = {
  term: string;
  ruleType: KnowledgeRoutingRuleType;
  matchMode: KnowledgeRoutingMatchMode;
  weight: number | null;
  retrievalConfigId: number | '';
  knowledgeBaseIds: string[];
  documentIds: string[];
  isEnabled: boolean;
  description: string;
};

const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const retrievalConfigs = ref<KnowledgeRetrievalConfig[]>([]);
const knowledgeBases = ref<KnowledgeBase[]>([]);
const documents = ref<KnowledgeBaseDocument[]>([]);

const form = reactive<RoutingRuleEditForm>({
  term: '',
  ruleType: 'generic',
  matchMode: 'contains',
  weight: -0.8,
  retrievalConfigId: '',
  knowledgeBaseIds: [],
  documentIds: [],
  isEnabled: true,
  description: '',
});

const needsTargets = computed(() => ['alias', 'exclusive'].includes(form.ruleType));

const selectedRetrievalConfig = computed(() =>
  retrievalConfigs.value.find((item) => item.id === Number(form.retrievalConfigId)),
);

const retrievalConfigOptions = computed(() =>
  retrievalConfigs.value.map((item) => ({ label: item.name, value: item.id })),
);

const scopedKnowledgeBases = computed(() => {
  const config = selectedRetrievalConfig.value;
  if (!config) return knowledgeBases.value;
  const selectedBaseIds = new Set(config.knowledgeBaseIds ?? []);
  const selectedCategoryIds = new Set(config.categoryIds ?? []);
  if (!selectedBaseIds.size && !selectedCategoryIds.size) return knowledgeBases.value;
  return knowledgeBases.value.filter(
    (item) => selectedBaseIds.has(item.id) || selectedCategoryIds.has(item.categoryId ?? 0),
  );
});

const knowledgeBaseOptions = computed(() =>
  scopedKnowledgeBases.value.map((item) => ({
    label: `${item.name}${item.code ? `（${item.code}）` : ''}`,
    value: String(item.id),
  })),
);

const availableDocuments = computed(() => {
  const selectedBaseIds = new Set(form.knowledgeBaseIds.map(Number));
  return documents.value.filter((item) => selectedBaseIds.has(item.knowledgeBaseId));
});

const documentOptions = computed(() => {
  const baseMap = new Map(knowledgeBases.value.map((item) => [item.id, item.name]));
  return availableDocuments.value.map((item) => ({
    label: `${baseMap.get(item.knowledgeBaseId) || `知识库 #${item.knowledgeBaseId}`} / ${item.title}`,
    value: String(item.id),
  }));
});

const fields = computed<FormField[]>(() => [
  { prop: 'term', label: '路由词', type: 'input', placeholder: '如 深大、报销、产品型号' },
  {
    prop: 'ruleType',
    label: '规则类型',
    type: 'select',
    options: knowledgeRoutingRuleTypeOptions.map((item) => ({ ...item })),
  },
  {
    prop: 'matchMode',
    label: '匹配方式',
    type: 'select',
    options: knowledgeRoutingMatchModeOptions.map((item) => ({ ...item })),
  },
  {
    prop: 'weight',
    label: '路由权重',
    component: 'InputNumber',
    componentProps: { min: -1, max: 1, precision: 4 },
  },
  {
    prop: 'retrievalConfigId',
    label: '所属检索配置',
    type: 'select',
    options: retrievalConfigOptions,
    placeholder: '请选择检索配置',
  },
  {
    prop: 'knowledgeBaseIds',
    label: '目标知识库',
    type: 'selectMultiple',
    options: knowledgeBaseOptions,
    placeholder: needsTargets.value ? '请选择至少一个目标知识库' : '公共词可不关联目标知识库',
  },
  {
    prop: 'documentIds',
    label: '目标文档',
    type: 'selectMultiple',
    options: documentOptions,
    componentProps: { disabled: !form.knowledgeBaseIds.length },
    placeholder: '可选；仅能选择已关联知识库下的文档',
  },
  {
    prop: 'isEnabled',
    label: '是否启用',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
  { prop: 'description', label: '说明', type: 'textarea', rows: 3 },
]);

const rules = computed<FormRules>(() => ({
  term: [{ required: true, message: '请输入路由词', trigger: 'blur' }],
  ruleType: [{ required: true, message: '请选择规则类型', trigger: 'change' }],
  retrievalConfigId: [{ required: true, message: '请选择所属检索配置', trigger: 'change' }],
  weight: [{ required: true, message: '请输入路由权重', trigger: 'blur' }],
}));

watch(visible, async (value) => {
  if (!value) return;
  loading.value = true;
  try {
    await fetchOptions();
    if (props.row?.id) {
      fillForm(await getKnowledgeRoutingRule(props.row.id));
    } else {
      resetForm();
    }
  } finally {
    loading.value = false;
  }
});

watch(
  () => form.knowledgeBaseIds,
  () => {
    const selectableIds = new Set(availableDocuments.value.map((item) => String(item.id)));
    form.documentIds = form.documentIds.filter((id) => selectableIds.has(id));
  },
  { deep: true },
);

watch(
  () => form.retrievalConfigId,
  () => {
    const selectableIds = new Set(scopedKnowledgeBases.value.map((item) => String(item.id)));
    form.knowledgeBaseIds = form.knowledgeBaseIds.filter((id) => selectableIds.has(id));
  },
);

watch(
  () => form.ruleType,
  (value, previousValue) => {
    if (value === previousValue || props.row?.id) return;
    form.weight = getDefaultWeight(value);
  },
);

async function fetchOptions() {
  const [retrievalResult, knowledgeBaseResult, documentResult] = await Promise.all([
    getKnowledgeRetrievalConfigs({ page: 1, pageSize: 500 }),
    getKnowledgeBases({ page: 1, pageSize: 500 }),
    getKnowledgeBaseDocuments({ page: 1, pageSize: 500 }),
  ]);
  retrievalConfigs.value = retrievalResult.list;
  knowledgeBases.value = knowledgeBaseResult.list;
  documents.value = documentResult.list;
}

function resetForm() {
  form.term = '';
  form.ruleType = 'generic';
  form.matchMode = 'contains';
  form.weight = -0.8;
  form.retrievalConfigId = retrievalConfigOptions.value[0]?.value ?? '';
  form.knowledgeBaseIds = [];
  form.documentIds = [];
  form.isEnabled = true;
  form.description = '';
}

function fillForm(data: KnowledgeRoutingRule) {
  form.term = data.term ?? '';
  form.ruleType = data.ruleType;
  form.matchMode = data.matchMode ?? 'contains';
  form.weight = Number(data.weight);
  form.retrievalConfigId = data.retrievalConfigId;
  form.knowledgeBaseIds = (data.knowledgeBaseIds ?? []).map(String);
  form.documentIds = (data.documentIds ?? []).map(String);
  form.isEnabled = !!data.isEnabled;
  form.description = data.description ?? '';
}

function getDefaultWeight(ruleType: KnowledgeRoutingRuleType) {
  if (ruleType === 'alias') return 0.8;
  if (ruleType === 'exclusive') return 1;
  return -0.8;
}

function buildPayload(): KnowledgeRoutingRuleForm {
  return {
    term: form.term.trim(),
    ruleType: form.ruleType,
    matchMode: form.matchMode,
    weight: Number(form.weight),
    retrievalConfigId: Number(form.retrievalConfigId),
    knowledgeBaseIds: form.knowledgeBaseIds.map(Number),
    documentIds: form.documentIds.map(Number),
    isEnabled: form.isEnabled,
    description: form.description.trim(),
  };
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (needsTargets.value && !form.knowledgeBaseIds.length) {
    ElMessage.warning('当前规则类型至少需要关联一个目标知识库');
    return;
  }
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateKnowledgeRoutingRule(props.row.id, buildPayload());
      ElMessage.success('更新成功');
    } else {
      await createKnowledgeRoutingRule(buildPayload());
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
    :title="props.row ? '编辑知识库路由规则' : '新增知识库路由规则'"
    width="760px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="120px" />
      <div class="knowledge-routing-rule-edit__tip">
        当前仅保存路由规则与映射关系，尚未接入 AI 聊天检索。公共词使用负权重；别名和专属路由使用正权重。
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.knowledge-routing-rule-edit__tip {
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}
</style>
