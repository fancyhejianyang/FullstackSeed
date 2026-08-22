<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules, type TreeInstance } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  createKnowledgeRetrievalConfig,
  getKnowledgeRetrievalConfig,
  updateKnowledgeRetrievalConfig,
  type KnowledgeRetrievalConfig,
  type KnowledgeRetrievalConfigForm,
  type KnowledgeRetrievalMode,
} from '@/api/knowledgeRetrievalConfig';
import {
  getKnowledgeBases,
  type KnowledgeBase,
  getKnowledgeBaseCategoryTree,
  type KnowledgeBaseCategoryTreeNode,
} from '@/api/knowledgeBase';
import {
  getAiFeatureConfigs,
  type AiFeatureConfig,
} from '@/api/aiFeatureConfig';

const props = defineProps<{
  row?: KnowledgeRetrievalConfig | null;
}>();

const emit = defineEmits<{ success: [] }>();

type RetrievalForm = {
  name: string;
  retrievalMode: KnowledgeRetrievalMode;
  knowledgeScopeKeys: string[];
  topK: number | null;
  minScore: number | null;
  rrfK: number | null;
  textWeight: number | null;
  vectorWeight: number | null;
  enableRerank: boolean;
  rerankAiFeatureConfigId: number | '';
  isEnabled: boolean;
  description: string;
};

const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const treeRef = ref<TreeInstance>();
const knowledgeBases = ref<KnowledgeBase[]>([]);
const categoryTree = ref<KnowledgeBaseCategoryTreeNode[]>([]);
const aiFeatureConfigs = ref<AiFeatureConfig[]>([]);

const form = reactive<RetrievalForm>({
  name: '',
  retrievalMode: 'hybrid',
  knowledgeScopeKeys: [],
  topK: 10,
  minScore: 0,
  rrfK: 60,
  textWeight: 0.8,
  vectorWeight: 1,
  enableRerank: false,
  rerankAiFeatureConfigId: '',
  isEnabled: true,
  description: '',
});

const retrievalModeOptions = [
  { label: '全文检索', value: 'fullText' },
  { label: '向量检索', value: 'vector' },
  { label: '混合检索', value: 'hybrid' },
];

type ScopeTreeNode = {
  id: string;
  label: string;
  disabled?: boolean;
  children?: ScopeTreeNode[];
};

const knowledgeScopeTree = computed<ScopeTreeNode[]>(() =>
  buildScopeTree(categoryTree.value),
);

const rerankConfigOptions = computed(() =>
  aiFeatureConfigs.value
    .filter((item) => item.isEnabled)
    .map((item) => ({
      label: `${item.name}（${item.providerName || '配置'} / ${item.model || '-'}）`,
      value: item.id,
    })),
);

const fields = computed<FormField[]>(() => {
  const items: FormField[] = [
    { prop: 'name', label: '配置名称', type: 'input', placeholder: '如 默认客服检索策略' },
    {
      prop: 'retrievalMode',
      label: '检索模式',
      type: 'select',
      options: retrievalModeOptions,
    },
    {
      prop: 'knowledgeScopeKeys',
      label: '知识库范围',
      slot: true,
    },
    {
      prop: 'topK',
      label: '召回上限',
      component: 'InputNumber',
      componentProps: { mode: 'integer', min: 1, max: 100 },
    },
    {
      prop: 'minScore',
      label: '默认最低分',
      component: 'InputNumber',
      componentProps: { min: 0, max: 1, precision: 4 },
    },
    {
      prop: 'rrfK',
      label: 'RRF K',
      component: 'InputNumber',
      componentProps: { mode: 'integer', min: 1, max: 500 },
    },
    {
      prop: 'textWeight',
      label: '文本权重',
      component: 'InputNumber',
      componentProps: { min: 0, max: 1, precision: 4 },
    },
    {
      prop: 'vectorWeight',
      label: '向量权重',
      component: 'InputNumber',
      componentProps: { min: 0, max: 1, precision: 4 },
    },
    {
      prop: 'enableRerank',
      label: '启用重排',
      component: 'Switch',
      componentProps: { activeText: '启用', inactiveText: '关闭' },
    },
  ];

  if (form.enableRerank) {
    items.push({
      prop: 'rerankAiFeatureConfigId',
      label: '重排 AI 配置',
      type: 'select',
      options: rerankConfigOptions,
      placeholder: '请选择重排 AI 配置',
    });
  }

  return [
    ...items,
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
  retrievalMode: [{ required: true, message: '请选择检索模式', trigger: 'change' }],
  topK: [{ required: true, message: '请输入召回上限', trigger: 'blur' }],
  ...(form.enableRerank
    ? {
        rerankAiFeatureConfigId: [
          { required: true, message: '请选择重排 AI 配置', trigger: 'change' },
        ],
      }
    : {}),
}));

watch(visible, async (value) => {
  if (!value) return;
  loading.value = true;
  try {
    await fetchOptions();
    if (props.row?.id) {
      fillForm(await getKnowledgeRetrievalConfig(props.row.id));
    } else {
      resetForm();
    }
  } finally {
    loading.value = false;
  }
});

watch(
  () => form.enableRerank,
  (value) => {
    if (!value) form.rerankAiFeatureConfigId = '';
  },
);

async function fetchOptions() {
  const [knowledgeBaseResult, categoryResult, configResult] = await Promise.all([
    getKnowledgeBases({ page: 1, pageSize: 500 }),
    getKnowledgeBaseCategoryTree({}),
    getAiFeatureConfigs({ page: 1, pageSize: 500 }),
  ]);
  knowledgeBases.value = knowledgeBaseResult.list;
  categoryTree.value = categoryResult;
  aiFeatureConfigs.value = configResult.list;
}

function resetForm() {
  form.name = '';
  form.retrievalMode = 'hybrid';
  form.knowledgeScopeKeys = [];
  setScopeTreeCheckedKeys([]);
  form.topK = 10;
  form.minScore = 0;
  form.rrfK = 60;
  form.textWeight = 0.8;
  form.vectorWeight = 1;
  form.enableRerank = false;
  form.rerankAiFeatureConfigId = '';
  form.isEnabled = true;
  form.description = '';
}

function fillForm(data: KnowledgeRetrievalConfig) {
  form.name = data.name ?? '';
  form.retrievalMode = data.retrievalMode ?? 'hybrid';
  form.knowledgeScopeKeys = [
    ...(Array.isArray(data.categoryIds)
      ? data.categoryIds.map((id) => `category:${id}`)
      : []),
    ...(Array.isArray(data.knowledgeBaseIds)
      ? data.knowledgeBaseIds.map((id) => `base:${id}`)
      : []),
  ];
  setScopeTreeCheckedKeys(form.knowledgeScopeKeys);
  form.topK = Number(data.topK ?? 10);
  form.minScore = Number(data.minScore ?? 0);
  form.rrfK = Number(data.rrfK ?? 60);
  form.textWeight = Number(data.textWeight ?? 0.8);
  form.vectorWeight = Number(data.vectorWeight ?? 1);
  form.enableRerank = !!data.enableRerank;
  form.rerankAiFeatureConfigId = data.rerankAiFeatureConfigId ?? '';
  form.isEnabled = !!data.isEnabled;
  form.description = data.description ?? '';
}

function buildPayload(): KnowledgeRetrievalConfigForm {
  const scope = splitScopeKeys(form.knowledgeScopeKeys);
  return {
    name: form.name.trim(),
    retrievalMode: form.retrievalMode,
    categoryIds: scope.categoryIds,
    knowledgeBaseIds: scope.knowledgeBaseIds,
    topK: form.topK,
    minScore: form.minScore,
    rrfK: form.rrfK,
    textWeight: form.textWeight,
    vectorWeight: form.vectorWeight,
    enableRerank: form.enableRerank,
    rerankAiFeatureConfigId: form.enableRerank
      ? Number(form.rerankAiFeatureConfigId)
      : null,
    isEnabled: form.isEnabled,
    description: form.description.trim(),
  };
}

function buildScopeTree(nodes: KnowledgeBaseCategoryTreeNode[]): ScopeTreeNode[] {
  const baseGroups = new Map<number, KnowledgeBase[]>();
  knowledgeBases.value.forEach((base) => {
    const key = base.categoryId ?? 0;
    const group = baseGroups.get(key) ?? [];
    group.push(base);
    baseGroups.set(key, group);
  });
  const categoryNodes = nodes.map((node) => buildCategoryNode(node, baseGroups));
  const uncategorized = baseGroups.get(0) ?? [];
  if (!uncategorized.length) return categoryNodes;
  return [
    ...categoryNodes,
    {
      id: 'category:0',
      label: '未分类',
      children: uncategorized.map(buildBaseNode),
    },
  ];
}

function buildCategoryNode(
  node: KnowledgeBaseCategoryTreeNode,
  baseGroups: Map<number, KnowledgeBase[]>,
): ScopeTreeNode {
  return {
    id: `category:${node.id}`,
    label: node.name,
    children: [
      ...(node.children ?? []).map((child) => buildCategoryNode(child, baseGroups)),
      ...(baseGroups.get(node.id) ?? []).map(buildBaseNode),
    ],
  };
}

function buildBaseNode(base: KnowledgeBase): ScopeTreeNode {
  return {
    id: `base:${base.id}`,
    label: `${base.name}${base.code ? `（${base.code}）` : ''}`,
    disabled: !base.isEnabled,
  };
}

function splitScopeKeys(keys: string[]) {
  return {
    categoryIds: keys
      .filter((key) => key.startsWith('category:'))
      .map((key) => Number(key.replace('category:', '')))
      .filter(Boolean),
    knowledgeBaseIds: keys
      .filter((key) => key.startsWith('base:'))
      .map((key) => Number(key.replace('base:', '')))
      .filter(Boolean),
  };
}

function handleScopeCheck() {
  form.knowledgeScopeKeys = (treeRef.value?.getCheckedKeys(false) ?? []).map(String);
}

function setScopeTreeCheckedKeys(keys: string[]) {
  void nextTick(() => {
    treeRef.value?.setCheckedKeys(keys, false);
  });
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (form.enableRerank && !form.rerankAiFeatureConfigId) {
    ElMessage.warning('请选择重排 AI 配置');
    return;
  }
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateKnowledgeRetrievalConfig(props.row.id, buildPayload());
      ElMessage.success('更新成功');
    } else {
      await createKnowledgeRetrievalConfig(buildPayload());
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
    :title="props.row ? '编辑知识库检索配置' : '新增知识库检索配置'"
    width="860px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="120px">
        <template #field-knowledgeScopeKeys>
          <div class="knowledge-retrieval-edit__scope">
            <el-tree
              ref="treeRef"
              :data="knowledgeScopeTree"
              node-key="id"
              show-checkbox
              default-expand-all
              :props="{ label: 'label', children: 'children', disabled: 'disabled' }"
              @check="handleScopeCheck"
            />
            <div class="knowledge-retrieval-edit__scope-tip">
              不勾选表示检索全部启用知识库；勾选分类表示该分类纳入范围，勾选文档表示只纳入指定文档。
            </div>
          </div>
        </template>
      </Form>
    </div>
  </Dialog>
</template>

<style scoped>
.knowledge-retrieval-edit__scope {
  width: 100%;
  min-height: 120px;
  max-height: 320px;
  overflow: auto;
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
}

.knowledge-retrieval-edit__scope-tip {
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}
</style>
