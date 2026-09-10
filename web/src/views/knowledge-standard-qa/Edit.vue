<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  createKnowledgeStandardQa,
  getKnowledgeStandardQa,
  updateKnowledgeStandardQa,
  type KnowledgeStandardQa,
  type KnowledgeStandardQaForm,
} from '@/api/knowledgeStandardQa';
import {
  getKnowledgeRetrievalConfigs,
  type KnowledgeRetrievalConfig,
} from '@/api/knowledgeRetrievalConfig';

export type KnowledgeStandardQaPrefill = {
  question: string;
  answer: string;
  sourceChatMessageId?: number | null;
  sourceChunkIds?: number[] | null;
};

const props = defineProps<{
  row?: KnowledgeStandardQa | null;
  prefill?: KnowledgeStandardQaPrefill | null;
}>();

const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>('visible', { required: true });
const formRef = ref<InstanceType<typeof Form>>();
const loading = ref(false);
const submitting = ref(false);
const retrievalConfigs = ref<KnowledgeRetrievalConfig[]>([]);

type StandardQaEditForm = {
  question: string;
  aliasesText: string;
  keywordsText: string;
  answer: string;
  retrievalConfigId: number | '';
  priority: number | null;
  matchThreshold: number | null;
  sourceChatMessageId: number | null;
  sourceChunkIds: number[];
  description: string;
};

const form = reactive<StandardQaEditForm>({
  question: '',
  aliasesText: '',
  keywordsText: '',
  answer: '',
  retrievalConfigId: '',
  priority: 0,
  matchThreshold: 0.88,
  sourceChatMessageId: null,
  sourceChunkIds: [],
  description: '',
});

const retrievalConfigOptions = computed(() => [
  { label: '全局标准问答', value: '' },
  ...retrievalConfigs.value.map((item) => ({ label: item.name, value: item.id })),
]);

const fields = computed<FormField[]>(() => [
  { prop: 'question', label: '标准问题', type: 'textarea', rows: 2, placeholder: '填写稳定、可复用的问题' },
  {
    prop: 'aliasesText',
    label: '相似问法',
    type: 'textarea',
    rows: 3,
    placeholder: '一行一个相似问法；用于高置信匹配',
  },
  {
    prop: 'keywordsText',
    label: '关键词',
    type: 'input',
    placeholder: '多个关键词使用逗号分隔，如 公司,历史,文化',
  },
  { prop: 'answer', label: '标准答案', type: 'textarea', rows: 8, placeholder: '支持 Markdown、链接和图片' },
  {
    prop: 'retrievalConfigId',
    label: '适用检索配置',
    type: 'select',
    options: retrievalConfigOptions.value,
    placeholder: '不选则在所有应用中生效',
    hint: form.retrievalConfigId
      ? '当前仅在所选检索配置的 AI 应用中参与标准问答匹配。'
      : '当前为全局标准问答：所有启用的检索配置均可命中它。',
  },
  {
    prop: 'priority',
    label: '优先级',
    component: 'InputNumber',
    componentProps: { mode: 'integer', min: -10000, max: 10000 },
    hint:
      Number(form.priority) > 0
        ? `当前 ${form.priority}：相似度接近时优先选择此条；值越大，优先级越高。`
        : Number(form.priority) < 0
          ? `当前 ${form.priority}：相似度接近时会后置此条，适合保留但不希望优先命中的答案。`
          : '当前为 0：不额外调整优先级，主要按问题匹配度决定。',
  },
  {
    prop: 'matchThreshold',
    label: '最低匹配度',
    component: 'InputNumber',
    componentProps: { min: 0.5, max: 1, precision: 4 },
    hint:
      Number(form.matchThreshold) < 0.7
        ? `当前 ${form.matchThreshold}：匹配范围较宽，命中率更高，但相近问题可能误用标准答案。`
        : Number(form.matchThreshold) < 0.9
          ? `当前 ${form.matchThreshold}：命中率与准确性较平衡，适合大多数稳定问答。`
          : `当前 ${form.matchThreshold}：只接受非常接近的问法，答案更稳妥但可能回退到知识库检索。`,
  },
  { prop: 'description', label: '说明', type: 'textarea', rows: 2 },
]);

const rules = computed<FormRules>(() => ({
  question: [{ required: true, message: '请输入标准问题', trigger: 'blur' }],
  answer: [{ required: true, message: '请输入标准答案', trigger: 'blur' }],
  matchThreshold: [{ required: true, message: '请输入最低匹配度', trigger: 'blur' }],
}));

watch(visible, async (value) => {
  if (!value) return;
  loading.value = true;
  try {
    const result = await getKnowledgeRetrievalConfigs({ page: 1, pageSize: 500 });
    retrievalConfigs.value = result.list;
    if (props.row?.id) {
      fillForm(await getKnowledgeStandardQa(props.row.id));
    } else {
      resetForm(props.prefill);
    }
  } finally {
    loading.value = false;
  }
});

function resetForm(prefill?: KnowledgeStandardQaPrefill | null) {
  form.question = prefill?.question ?? '';
  form.aliasesText = '';
  form.keywordsText = '';
  form.answer = prefill?.answer ?? '';
  form.retrievalConfigId = '';
  form.priority = 0;
  form.matchThreshold = 0.88;
  form.sourceChatMessageId = prefill?.sourceChatMessageId ?? null;
  form.sourceChunkIds = prefill?.sourceChunkIds ?? [];
  form.description = prefill ? '来源：问答记录人工收录，请审核后发布。' : '';
}

function fillForm(data: KnowledgeStandardQa) {
  form.question = data.question ?? '';
  form.aliasesText = (data.aliases ?? []).join('\n');
  form.keywordsText = (data.keywords ?? []).join(', ');
  form.answer = data.answer ?? '';
  form.retrievalConfigId = data.retrievalConfigId ?? '';
  form.priority = Number(data.priority ?? 0);
  form.matchThreshold = Number(data.matchThreshold ?? 0.88);
  form.sourceChatMessageId = data.sourceChatMessageId ?? null;
  form.sourceChunkIds = data.sourceChunkIds ?? [];
  form.description = data.description ?? '';
}

function splitTexts(value: string, separator: RegExp) {
  return Array.from(new Set(value.split(separator).map((item) => item.trim()).filter(Boolean)));
}

function buildPayload(): KnowledgeStandardQaForm {
  return {
    question: form.question.trim(),
    aliases: splitTexts(form.aliasesText, /\r?\n/),
    keywords: splitTexts(form.keywordsText, /[,，\r?\n]/),
    answer: form.answer.trim(),
    retrievalConfigId: form.retrievalConfigId ? Number(form.retrievalConfigId) : null,
    priority: Number(form.priority),
    matchThreshold: Number(form.matchThreshold),
    sourceChatMessageId: form.sourceChatMessageId,
    sourceChunkIds: form.sourceChunkIds,
    description: form.description.trim(),
  };
}

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateKnowledgeStandardQa(props.row.id, buildPayload());
      ElMessage.success('标准问答已更新');
    } else {
      await createKnowledgeStandardQa(buildPayload());
      ElMessage.success('标准问答已创建，请审核后发布');
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
    :title="props.row ? '编辑标准问答' : '收录标准问答'"
    width="800px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="120px" />
      <div class="knowledge-standard-qa-edit__tip">
        保存后先保留为草稿；编辑确认无误后，请在标准问答库提交审批。管理员通过后才会发布并参与 AI 问答匹配。
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.knowledge-standard-qa-edit__tip {
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}
</style>
