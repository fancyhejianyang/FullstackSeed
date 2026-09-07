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
  getKnowledgeBaseCategoryTree,
  type KnowledgeBase,
  type KnowledgeBaseCategoryTreeNode,
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
  categoryIds: string[];
  knowledgeBaseIds: string[];
  isEnabled: boolean;
  description: string;
};

const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const retrievalConfigs = ref<KnowledgeRetrievalConfig[]>([]);
const knowledgeBases = ref<KnowledgeBase[]>([]);
const categoryTree = ref<KnowledgeBaseCategoryTreeNode[]>([]);

const form = reactive<RoutingRuleEditForm>({
  term: '',
  ruleType: 'generic',
  matchMode: 'contains',
  weight: -0.8,
  retrievalConfigId: '',
  categoryIds: [],
  knowledgeBaseIds: [],
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

const scopedCategoryIds = computed(() => {
  const config = selectedRetrievalConfig.value;
  if (!config) return new Set(flattenCategories(categoryTree.value).map((item) => item.id));
  const selectedCategoryIds = new Set(config.categoryIds ?? []);
  const selectedBaseIds = new Set(config.knowledgeBaseIds ?? []);
  if (!selectedCategoryIds.size && !selectedBaseIds.size) {
    return new Set(flattenCategories(categoryTree.value).map((item) => item.id));
  }
  return selectedCategoryIds;
});

const categoryOptions = computed(() =>
  flattenCategories(categoryTree.value)
    .filter((item) => scopedCategoryIds.value.has(item.id))
    .map((item) => ({ label: item.label, value: String(item.id) })),
);

const knowledgeBaseOptions = computed(() =>
  scopedKnowledgeBases.value
    .filter(
      (item) =>
        !form.categoryIds.length || form.categoryIds.map(Number).includes(item.categoryId ?? 0),
    )
    .map((item) => ({
      label: `${item.name}${item.code ? `（${item.code}）` : ''}`,
    value: String(item.id),
    })),
);

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
    prop: 'categoryIds',
    label: '目标分类',
    type: 'selectMultiple',
    options: categoryOptions,
    placeholder: needsTargets.value ? '请选择目标分类或知识库' : '公共词可不关联目标范围',
  },
  {
    prop: 'knowledgeBaseIds',
    label: '目标知识库',
    type: 'selectMultiple',
    options: knowledgeBaseOptions,
    placeholder: form.categoryIds.length ? '可选；仅能选择目标分类下的知识库' : '可选；用于精确限定路由范围',
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
  () => form.categoryIds,
  () => {
    const selectableIds = new Set(knowledgeBaseOptions.value.map((item) => item.value));
    form.knowledgeBaseIds = form.knowledgeBaseIds.filter((id) => selectableIds.has(id));
  },
  { deep: true },
);

watch(
  () => form.retrievalConfigId,
  () => {
    const selectableCategoryIds = new Set(categoryOptions.value.map((item) => item.value));
    form.categoryIds = form.categoryIds.filter((id) => selectableCategoryIds.has(id));
    const selectableIds = new Set(knowledgeBaseOptions.value.map((item) => item.value));
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
  const [retrievalResult, knowledgeBaseResult, categoryResult] = await Promise.all([
    getKnowledgeRetrievalConfigs({ page: 1, pageSize: 500 }),
    getKnowledgeBases({ page: 1, pageSize: 500 }),
    getKnowledgeBaseCategoryTree({}),
  ]);
  retrievalConfigs.value = retrievalResult.list;
  knowledgeBases.value = knowledgeBaseResult.list;
  categoryTree.value = categoryResult;
}

function resetForm() {
  form.term = '';
  form.ruleType = 'generic';
  form.matchMode = 'contains';
  form.weight = -0.8;
  form.retrievalConfigId = retrievalConfigOptions.value[0]?.value ?? '';
  form.categoryIds = [];
  form.knowledgeBaseIds = [];
  form.isEnabled = true;
  form.description = '';
}

function fillForm(data: KnowledgeRoutingRule) {
  form.term = data.term ?? '';
  form.ruleType = data.ruleType;
  form.matchMode = data.matchMode ?? 'contains';
  form.weight = Number(data.weight);
  form.retrievalConfigId = data.retrievalConfigId;
  form.categoryIds = (data.categoryIds ?? []).map(String);
  form.knowledgeBaseIds = (data.knowledgeBaseIds ?? []).map(String);
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
    categoryIds: form.categoryIds.map(Number),
    knowledgeBaseIds: form.knowledgeBaseIds.map(Number),
    isEnabled: form.isEnabled,
    description: form.description.trim(),
  };
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (needsTargets.value && !form.categoryIds.length && !form.knowledgeBaseIds.length) {
    ElMessage.warning('当前规则类型至少需要关联一个目标分类或知识库');
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

function flattenCategories(
  nodes: KnowledgeBaseCategoryTreeNode[],
  level = 0,
): Array<{ id: number; label: string }> {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'　'.repeat(level)}${node.name}` },
    ...flattenCategories(node.children ?? [], level + 1),
  ]);
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
        路由按“目标分类 → 可选目标知识库”收窄范围，并已接入 AI 聊天检索。公共词使用负权重；别名和专属路由使用正权重。
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
