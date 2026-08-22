<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  createExternalApp,
  getExternalApp,
  updateExternalApp,
  type ExternalApp,
  type ExternalAppForm,
} from '@/api/externalApp';
import {
  getAiFeatureConfigs,
  type AiFeatureConfig,
} from '@/api/aiFeatureConfig';
import {
  getKnowledgeRetrievalConfigs,
  type KnowledgeRetrievalConfig,
} from '@/api/knowledgeRetrievalConfig';

const props = defineProps<{
  row?: ExternalApp | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const chatConfigs = ref<AiFeatureConfig[]>([]);
const retrievalConfigs = ref<KnowledgeRetrievalConfig[]>([]);

const form = reactive<ExternalAppForm>({
  name: '',
  appId: '',
  domain: '',
  aiFeatureConfigId: null,
  retrievalConfigId: null,
  isEnabled: true,
  description: '',
});

const fields = computed<FormField[]>(() => [
  { prop: 'name', label: '应用名称', type: 'input', placeholder: '如 H5聊天应用' },
  {
    prop: 'appId',
    label: 'AppId',
    type: 'input',
    placeholder: '创建时留空则自动生成',
  },
  {
    prop: 'aiFeatureConfigId',
    label: 'AI 聊天配置',
    type: 'select',
    placeholder: '请选择 AI 聊天配置',
    options: chatConfigs.value.map((item) => ({
      label: `${item.name}（${item.providerName || '-'} / ${item.model || '-'}）`,
      value: item.id,
    })),
  },
  {
    prop: 'retrievalConfigId',
    label: '知识库检索配置',
    type: 'select',
    placeholder: '不使用知识库检索',
    options: [
      { label: '不使用知识库检索', value: '' },
      ...retrievalConfigs.value.map((item) => ({
        label: `${item.name}（${getRetrievalModeText(item.retrievalMode)}）`,
        value: item.id,
      })),
    ],
  },
  {
    prop: 'domain',
    label: '白名单域名',
    type: 'textarea',
    rows: 4,
    placeholder: '如 h5.example.com；多个域名可用逗号或换行分隔，留空则不校验',
  },
  {
    prop: 'isEnabled',
    label: '是否启用',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
  { prop: 'description', label: '描述', type: 'textarea', rows: 3 },
]);

const rules: FormRules = {
  name: [{ required: true, message: '请输入应用名称', trigger: 'blur' }],
  aiFeatureConfigId: [
    { required: true, message: '请选择 AI 聊天配置', trigger: 'change' },
  ],
};

function resetForm() {
  form.name = '';
  form.appId = '';
  form.domain = '';
  form.aiFeatureConfigId = chatConfigs.value.length === 1 ? chatConfigs.value[0].id : null;
  form.retrievalConfigId =
    retrievalConfigs.value.length === 1 ? retrievalConfigs.value[0].id : null;
  form.isEnabled = true;
  form.description = '';
}

function fillForm(data: ExternalApp) {
  form.name = data.name ?? '';
  form.appId = data.appId ?? '';
  form.domain = data.domain ?? '';
  form.aiFeatureConfigId =
    data.aiFeatureConfigId ??
    (chatConfigs.value.length === 1 ? chatConfigs.value[0].id : null);
  form.retrievalConfigId =
    data.retrievalConfigId ??
    (retrievalConfigs.value.length === 1 ? retrievalConfigs.value[0].id : null);
  form.isEnabled = !!data.isEnabled;
  form.description = data.description ?? '';
}

watch(visible, async (value) => {
  if (!value) return;
  loading.value = true;
  if (props.row?.id) {
    try {
      await fetchChatConfigs();
      fillForm(await getExternalApp(props.row.id));
    } finally {
      loading.value = false;
    }
  } else {
    try {
      await fetchChatConfigs();
      resetForm();
    } finally {
      loading.value = false;
    }
  }
});

async function fetchChatConfigs() {
  const [chatResult, retrievalResult] = await Promise.all([
    getAiFeatureConfigs({
      page: 1,
      pageSize: 200,
      featureType: 'chat',
    }),
    getKnowledgeRetrievalConfigs({
      page: 1,
      pageSize: 200,
    }),
  ]);
  chatConfigs.value = chatResult.list.filter((item) => item.isEnabled);
  retrievalConfigs.value = retrievalResult.list.filter((item) => item.isEnabled);
  if (!chatConfigs.value.length) {
    ElMessage.warning('请先新增并启用聊天类型的 AI 功能配置');
  }
}

function buildPayload() {
  const payload: ExternalAppForm = {
    name: form.name.trim(),
    appId: form.appId?.trim(),
    domain: form.domain?.trim(),
    aiFeatureConfigId: Number(form.aiFeatureConfigId),
    retrievalConfigId: form.retrievalConfigId
      ? Number(form.retrievalConfigId)
      : null,
    isEnabled: form.isEnabled,
    description: form.description?.trim(),
  };
  if (!payload.appId) delete payload.appId;
  return payload;
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (!form.aiFeatureConfigId) {
    ElMessage.warning('请选择 AI 聊天配置');
    return;
  }
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateExternalApp(props.row.id, buildPayload());
      ElMessage.success('更新成功');
    } else {
      await createExternalApp(buildPayload());
      ElMessage.success('创建成功');
    }
    visible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
}

function getRetrievalModeText(mode: string) {
  const map: Record<string, string> = {
    fullText: '全文检索',
    vector: '向量检索',
    hybrid: '混合检索',
  };
  return map[mode] || mode;
}
</script>

<template>
  <Dialog
    v-model="visible"
    :title="props.row ? '编辑聊天应用' : '新增聊天应用'"
    width="760px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="110px" />
    </div>
  </Dialog>
</template>
