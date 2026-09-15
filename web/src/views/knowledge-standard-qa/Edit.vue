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

type StandardQaEditForm = {
  question: string;
  aliasesText: string;
  answer: string;
  sourceChatMessageId: number | null;
  sourceChunkIds: number[];
};

const form = reactive<StandardQaEditForm>({
  question: '',
  aliasesText: '',
  answer: '',
  sourceChatMessageId: null,
  sourceChunkIds: [],
});

const fields = computed<FormField[]>(() => [
  {
    prop: 'question',
    label: '标准问题',
    type: 'textarea',
    rows: 2,
    placeholder: '填写稳定、可复用的问题',
    hint: '仅当用户问题与标准问题或相似问法一致时，系统才会直接返回本条标准答案。',
  },
  {
    prop: 'aliasesText',
    label: '相似问法',
    type: 'textarea',
    rows: 3,
    placeholder: '一行一个与标准问题含义完全相同的问法',
    hint: '会忽略大小写、空格和标点；不会按关键词或语义进行模糊猜测。',
  },
  { prop: 'answer', label: '标准答案', type: 'textarea', rows: 8, placeholder: '支持 Markdown、链接和图片' },
]);

const rules = computed<FormRules>(() => ({
  question: [{ required: true, message: '请输入标准问题', trigger: 'blur' }],
  answer: [{ required: true, message: '请输入标准答案', trigger: 'blur' }],
}));

watch(visible, async (value) => {
  if (!value) return;
  loading.value = true;
  try {
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
  form.answer = prefill?.answer ?? '';
  form.sourceChatMessageId = prefill?.sourceChatMessageId ?? null;
  form.sourceChunkIds = prefill?.sourceChunkIds ?? [];
}

function fillForm(data: KnowledgeStandardQa) {
  form.question = data.question ?? '';
  form.aliasesText = (data.aliases ?? []).join('\n');
  form.answer = data.answer ?? '';
  form.sourceChatMessageId = data.sourceChatMessageId ?? null;
  form.sourceChunkIds = data.sourceChunkIds ?? [];
}

function splitTexts(value: string, separator: RegExp) {
  return Array.from(new Set(value.split(separator).map((item) => item.trim()).filter(Boolean)));
}

function buildPayload(): KnowledgeStandardQaForm {
  return {
    question: form.question.trim(),
    aliases: splitTexts(form.aliasesText, /\r?\n/),
    answer: form.answer.trim(),
    sourceChatMessageId: form.sourceChatMessageId,
    sourceChunkIds: form.sourceChunkIds,
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
        保存后先保留为草稿；编辑确认无误后，请在标准问答库提交审批。管理员通过后，只有标准问题或相似问法被精确命中时才会直接返回固定答案。
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
