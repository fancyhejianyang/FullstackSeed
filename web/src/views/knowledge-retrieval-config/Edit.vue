<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules, type TreeInstance } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import AiWorkflowEditor from '@/components/AiWorkflowEditor.vue';
import {
  createKnowledgeRetrievalConfig,
  getKnowledgeRetrievalConfig,
  updateKnowledgeRetrievalConfig,
  type KnowledgeRetrievalConfig,
  type KnowledgeRetrievalConfigForm,
  type KnowledgeRetrievalMode,
  type AiWorkflowDefinition,
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
import {
  createInitialAiWorkflowDefinition,
  getAiWorkflowFlags,
  getWorkflowValidationErrors,
  getWorkflowFallbackFlags,
  normalizeAiWorkflowDefinition,
} from '@/utils/aiWorkflow';

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
  sessionContextTimeoutMinutes: number | null;
  workflowDefinition: AiWorkflowDefinition;
  enableStandardQa: boolean;
  enableColloquial: boolean;
  enableKnowledgeRetrieval: boolean;
  enableBusinessCommands: boolean;
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
  topK: 6,
  minScore: 0.35,
  rrfK: 60,
  textWeight: 0.8,
  vectorWeight: 1,
  sessionContextTimeoutMinutes: 15,
  workflowDefinition: createInitialAiWorkflowDefinition(),
  enableStandardQa: true,
  enableColloquial: true,
  enableKnowledgeRetrieval: true,
  enableBusinessCommands: false,
  enableRerank: true,
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

const workflowFlags = computed(() => getAiWorkflowFlags(form.workflowDefinition));

const fields = computed<FormField[]>(() => {
  const items: FormField[] = [
    {
      prop: 'name',
      label: '工作流名称',
      type: 'input',
      placeholder: '如 通用知识库客服、商品业务客服',
      span: 2,
      hint: '工作流决定一次提问会经过哪些处理环节；可同时用于通用知识库客服或业务客服。',
    },
    {
      prop: 'workflowDefinition',
      label: '流程编排',
      slot: true,
      span: 2,
      hint: '新建流程仅从输入清洗入口开始；从节点库加入步骤，并从节点右侧或底部蓝点拖至目标节点建立流向。',
    },
    {
      prop: 'retrievalMode',
      label: '检索模式',
      type: 'select',
      options: retrievalModeOptions,
      hint:
        form.retrievalMode === 'hybrid'
          ? '当前为混合检索：合并关键词命中和语义相似度，适合大多数知识库。'
          : form.retrievalMode === 'fullText'
            ? '当前仅全文检索：更看重用户原词、编号和专有名词。'
            : '当前仅向量检索：更擅长匹配同义表达，但对精确编号较弱。',
    },
    {
      prop: 'topK',
      label: '召回上限',
      component: 'InputNumber',
      componentProps: { mode: 'integer', min: 1, max: 100 },
      hint:
        Number(form.topK) <= 3
          ? `当前取前 ${form.topK} 条：回答更聚焦、提示词更短，但可能漏掉补充信息。`
          : Number(form.topK) <= 8
            ? `当前取前 ${form.topK} 条：覆盖度与回答聚焦度较均衡。`
            : `当前取前 ${form.topK} 条：覆盖更广，但上下文更长，可能带入噪声并增加模型成本。`,
    },
    {
      prop: 'minScore',
      label: '最低相关度',
      component: 'InputNumber',
      componentProps: { min: 0, max: 1, precision: 4 },
      hint:
        Number(form.minScore) < 0.25
          ? `当前 ${form.minScore}：门槛较低，能保留更多候选，但无关内容进入回答的风险更高。`
          : Number(form.minScore) <= 0.45
            ? `当前 ${form.minScore}：相关度过滤较均衡，适合作为通用起点。`
            : `当前 ${form.minScore}：门槛较高，答案更谨慎，但可能因无片段达标而拒答。`,
    },
    {
      prop: 'rrfK',
      label: 'RRF K',
      component: 'InputNumber',
      componentProps: { mode: 'integer', min: 1, max: 500 },
      hint:
        Number(form.rrfK) <= 20
          ? `当前 ${form.rrfK}：更强调各检索通道的头部排名，排序差异更明显。`
          : Number(form.rrfK) <= 80
            ? `当前 ${form.rrfK}：平衡各通道排名，是混合检索的常用范围。`
            : `当前 ${form.rrfK}：各名次差距会被拉平，更多候选有机会参与融合。`,
    },
    {
      prop: 'textWeight',
      label: '文本权重',
      component: 'InputNumber',
      componentProps: { min: 0, max: 1, precision: 4 },
      hint:
        Number(form.textWeight) <= 0
          ? '当前为 0：全文检索结果不参与融合排序。'
          : `当前全文融合占比约 ${Math.round((Number(form.textWeight) / Math.max(Number(form.textWeight) + Number(form.vectorWeight), 0.0001)) * 100)}%；提高它会更重视原词、编号和关键词。`,
    },
    {
      prop: 'vectorWeight',
      label: '向量权重',
      component: 'InputNumber',
      componentProps: { min: 0, max: 1, precision: 4 },
      hint:
        Number(form.vectorWeight) <= 0
          ? '当前为 0：向量检索结果不参与融合排序。'
          : `当前语义融合占比约 ${Math.round((Number(form.vectorWeight) / Math.max(Number(form.textWeight) + Number(form.vectorWeight), 0.0001)) * 100)}%；提高它会更重视语义相近和同义表达。`,
    },
    {
      prop: 'sessionContextTimeoutMinutes',
      label: '上下文有效期（分钟）',
      component: 'InputNumber',
      componentProps: {
        mode: 'integer',
        min: 0,
        max: 1440,
        placeholder: '默认 15，填 0 则每次独立检索',
      },
      hint:
        Number(form.sessionContextTimeoutMinutes) <= 0
          ? '当前为 0：每次提问都独立检索，不沿用上一轮命中的知识库。'
          : Number(form.sessionContextTimeoutMinutes) <= 15
            ? `当前 ${form.sessionContextTimeoutMinutes} 分钟：短时间追问可沿用上下文，切换话题的干扰较少。`
            : `当前 ${form.sessionContextTimeoutMinutes} 分钟：连续对话保持更久，但用户换话题后可能受旧上下文影响。`,
    },
  ];

  if (workflowFlags.value.enableKnowledgeRetrieval && workflowFlags.value.enableRerank) {
    items.push({
      prop: 'rerankAiFeatureConfigId',
      label: 'LLM 重排配置',
      type: 'select',
      options: rerankConfigOptions,
      placeholder: '请选择 LLM 重排配置',
      hint: '该配置只用于给候选片段评分和排序；只能选择“LLM 重排”类型，不会使用聊天提示词或生成最终回答。',
    });
  }

  if (workflowFlags.value.enableKnowledgeRetrieval) {
    items.push({
      prop: 'knowledgeScopeKeys',
      label: '知识库范围',
      slot: true,
      span: 2,
    });
  }

  const visibleItems = workflowFlags.value.enableKnowledgeRetrieval
    ? items
    : items.filter((item) =>
        ![
          'retrievalMode',
          'knowledgeScopeKeys',
          'topK',
          'minScore',
          'rrfK',
          'textWeight',
          'vectorWeight',
          'sessionContextTimeoutMinutes',
          'rerankAiFeatureConfigId',
        ].includes(item.prop),
      );

  return [
    ...visibleItems,
    {
      prop: 'isEnabled',
      label: '是否启用',
      component: 'Switch',
      componentProps: { activeText: '启用', inactiveText: '停用' },
    },
    { prop: 'description', label: '描述', type: 'textarea', rows: 3, span: 2 },
  ];
});

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: '请输入工作流名称', trigger: 'blur' }],
  ...(workflowFlags.value.enableKnowledgeRetrieval
    ? {
        retrievalMode: [{ required: true, message: '请选择检索模式', trigger: 'change' }],
        topK: [{ required: true, message: '请输入召回上限', trigger: 'blur' }],
        sessionContextTimeoutMinutes: [
          { required: true, message: '请输入上下文有效期', trigger: 'blur' },
        ],
      }
    : {}),
  ...(workflowFlags.value.enableKnowledgeRetrieval && workflowFlags.value.enableRerank
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
  () => workflowFlags.value.enableRerank,
  (value) => {
    if (!value) {
      form.rerankAiFeatureConfigId = '';
      return;
    }
    if (!form.rerankAiFeatureConfigId) {
      form.rerankAiFeatureConfigId = rerankConfigOptions.value[0]?.value ?? '';
    }
  },
);

watch(
  () => form.workflowDefinition,
  () => syncLegacyWorkflowFlags(),
  { deep: true },
);

async function fetchOptions() {
  const [knowledgeBaseResult, categoryResult, configResult] = await Promise.all([
    getKnowledgeBases({ page: 1, pageSize: 500 }),
    getKnowledgeBaseCategoryTree({}),
    getAiFeatureConfigs({ page: 1, pageSize: 500, featureType: 'rerank' }),
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
  form.topK = 6;
  form.minScore = 0.35;
  form.rrfK = 60;
  form.textWeight = 0.8;
  form.vectorWeight = 1;
  form.sessionContextTimeoutMinutes = 15;
  form.workflowDefinition = createInitialAiWorkflowDefinition();
  syncLegacyWorkflowFlags();
  form.rerankAiFeatureConfigId = rerankConfigOptions.value[0]?.value ?? '';
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
  form.topK = Number(data.topK ?? 6);
  form.minScore = Number(data.minScore ?? 0.35);
  form.rrfK = Number(data.rrfK ?? 60);
  form.textWeight = Number(data.textWeight ?? 0.8);
  form.vectorWeight = Number(data.vectorWeight ?? 1);
  form.sessionContextTimeoutMinutes = Number(
    data.sessionContextTimeoutMinutes ?? 15,
  );
  form.workflowDefinition = normalizeAiWorkflowDefinition(
    data.workflowDefinition,
    getWorkflowFallbackFlags(data),
  );
  syncLegacyWorkflowFlags();
  form.rerankAiFeatureConfigId = data.rerankAiFeatureConfigId ?? '';
  form.isEnabled = !!data.isEnabled;
  form.description = data.description ?? '';
}

function buildPayload(): KnowledgeRetrievalConfigForm {
  const scope = splitScopeKeys(form.knowledgeScopeKeys);
  const workflowDefinition = normalizeAiWorkflowDefinition(form.workflowDefinition);
  const workflowFlags = getAiWorkflowFlags(workflowDefinition);
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
    sessionContextTimeoutMinutes: form.sessionContextTimeoutMinutes,
    workflowDefinition,
    enableStandardQa: workflowFlags.enableStandardQa,
    enableColloquial: workflowFlags.enableColloquial,
    enableKnowledgeRetrieval: workflowFlags.enableKnowledgeRetrieval,
    enableBusinessCommands: workflowFlags.enableBusinessCommands,
    enableRerank: workflowFlags.enableRerank,
    rerankAiFeatureConfigId: workflowFlags.enableRerank
      ? Number(form.rerankAiFeatureConfigId)
      : null,
    isEnabled: form.isEnabled,
    description: form.description.trim(),
  };
}

function syncLegacyWorkflowFlags() {
  const flags = getAiWorkflowFlags(form.workflowDefinition);
  form.enableStandardQa = flags.enableStandardQa;
  form.enableColloquial = flags.enableColloquial;
  form.enableKnowledgeRetrieval = flags.enableKnowledgeRetrieval;
  form.enableBusinessCommands = flags.enableBusinessCommands;
  form.enableRerank = flags.enableRerank;
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
  const workflowErrors = getWorkflowValidationErrors(form.workflowDefinition);
  if (workflowErrors.length) {
    ElMessage.warning(workflowErrors[0]);
    return;
  }
  if (workflowFlags.value.enableKnowledgeRetrieval && workflowFlags.value.enableRerank && !form.rerankAiFeatureConfigId) {
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
    :title="props.row ? '编辑 AI 工作流配置' : '新增 AI 工作流配置'"
    width="min(1180px, calc(100vw - 32px))"
    body-max-height="82vh"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="118px"
        :columns="2"
      >
        <template #field-workflowDefinition>
          <AiWorkflowEditor v-model="form.workflowDefinition" />
        </template>
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
      <div v-if="workflowFlags.enableKnowledgeRetrieval" class="knowledge-retrieval-edit__session-tip">
        有效期内，未明确切换知识库的追问会优先使用上一轮命中知识库；超过有效期按新问题重新检索。填 0 则关闭知识库上下文复用。
      </div>
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

.knowledge-retrieval-edit__session-tip {
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}
</style>
