<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  createKnowledgeAiProvider,
  getKnowledgeAiProvider,
  updateKnowledgeAiProvider,
  type KnowledgeAiProvider,
  type KnowledgeAiProviderForm,
} from '@/api/knowledgeAiProvider';

const props = defineProps<{
  row?: KnowledgeAiProvider | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();

const form = reactive<KnowledgeAiProviderForm>({
  name: '',
  apiUrl: '',
  chatApiPath: 'v1/chat/completions',
  secretKey: '',
  models: 'qwen-plus',
  isEnabled: true,
  description: '',
});

const fields: FormField[] = [
  { prop: 'name', label: '名称', type: 'input', placeholder: '如 OpenAI生产账号' },
  { prop: 'apiUrl', label: 'API 地址', type: 'input', placeholder: '如 https://api.openai.com' },
  {
    prop: 'chatApiPath',
    label: 'Chat 路径',
    type: 'input',
    placeholder: 'v1/chat/completions',
  },
  {
    prop: 'secretKey',
    label: '密钥',
    type: 'input',
    inputMode: 'password',
    placeholder: '编辑时留空表示不修改',
  },
  {
    prop: 'models',
    label: '模型列表',
    type: 'textarea',
    rows: 5,
    placeholder: '模型编码#模型名称\nqwen-plus#通义千问 Plus',
  },
  {
    prop: 'isEnabled',
    label: '是否启用',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
  { prop: 'description', label: '描述', type: 'textarea', rows: 3 },
];

const rules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  apiUrl: [{ required: true, message: '请输入 API 地址', trigger: 'blur' }],
};

function resetForm() {
  form.name = '';
  form.apiUrl = '';
  form.chatApiPath = 'v1/chat/completions';
  form.secretKey = '';
  form.models = 'qwen-plus';
  form.isEnabled = true;
  form.description = '';
}

function fillForm(data: KnowledgeAiProvider) {
  form.name = data.name ?? '';
  form.apiUrl = data.apiUrl ?? '';
  form.chatApiPath = data.chatApiPath || 'v1/chat/completions';
  form.secretKey = '';
  form.models = data.models || 'qwen-plus';
  form.isEnabled = !!data.isEnabled;
  form.description = data.description ?? '';
}

watch(visible, async (value) => {
  if (!value) return;
  if (props.row?.id) {
    loading.value = true;
    try {
      fillForm(await getKnowledgeAiProvider(props.row.id));
    } finally {
      loading.value = false;
    }
  } else {
    resetForm();
  }
});

function buildPayload() {
  const payload: KnowledgeAiProviderForm = { ...form };
  if (props.row && !payload.secretKey?.trim()) {
    delete payload.secretKey;
  }
  return payload;
}

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateKnowledgeAiProvider(props.row.id, buildPayload());
      ElMessage.success('更新成功');
    } else {
      await createKnowledgeAiProvider(buildPayload());
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
    :title="props.row ? '编辑大模型账号' : '新增大模型账号'"
    width="760px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="100px" />
    </div>
  </Dialog>
</template>
