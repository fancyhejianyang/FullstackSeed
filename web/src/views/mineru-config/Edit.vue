<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  createMineruConfig,
  getMineruConfig,
  updateMineruConfig,
  type MineruConfig,
  type MineruConfigForm,
} from '@/api/mineruConfig';

const props = defineProps<{
  row?: MineruConfig | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();

const form = reactive<MineruConfigForm>({
  name: '',
  baseUrl: 'https://mineru.net',
  token: '',
  authMode: 'Bearer',
  modelVersion: 'vlm',
  createTaskPath: '/api/v4/extract/task',
  queryTaskPath: '/api/v4/extract/task/{task_id}',
  pollIntervalSeconds: 5,
  timeoutMinutes: 30,
  isOcr: true,
  enableFormula: true,
  enableTable: true,
  isEnabled: false,
});

const authModeOptions = [
  { label: 'Bearer', value: 'Bearer' },
  { label: 'TokenHeader', value: 'TokenHeader' },
];

const fields: FormField[] = [
  { prop: 'name', label: '配置名称', type: 'input', placeholder: '如 MinerU生产配置' },
  { prop: 'baseUrl', label: '服务地址', type: 'input', placeholder: 'https://mineru.net' },
  {
    prop: 'token',
    label: '访问令牌',
    type: 'input',
    inputMode: 'password',
    placeholder: '编辑时留空表示不修改',
  },
  {
    prop: 'authMode',
    label: '认证模式',
    type: 'select',
    options: authModeOptions,
    componentProps: { clearable: false },
  },
  { prop: 'modelVersion', label: '模型版本', type: 'input', placeholder: 'vlm' },
  {
    prop: 'createTaskPath',
    label: '创建路径',
    type: 'input',
    placeholder: '/api/v4/extract/task',
  },
  {
    prop: 'queryTaskPath',
    label: '查询路径',
    type: 'input',
    placeholder: '/api/v4/extract/task/{task_id}',
  },
  {
    prop: 'pollIntervalSeconds',
    label: '轮询间隔',
    component: 'InputNumber',
    componentProps: { mode: 'integer', min: 1, precision: 0 },
  },
  {
    prop: 'timeoutMinutes',
    label: '超时时间',
    component: 'InputNumber',
    componentProps: { mode: 'integer', min: 1, precision: 0 },
  },
  {
    prop: 'isOcr',
    label: '启用 OCR',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
  {
    prop: 'enableFormula',
    label: '识别公式',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
  {
    prop: 'enableTable',
    label: '识别表格',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
  {
    prop: 'isEnabled',
    label: '是否启用',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
];

const rules: FormRules = {
  name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  baseUrl: [{ required: true, message: '请输入服务地址', trigger: 'blur' }],
  token: [
    {
      validator: (_rule, value, callback) => {
        if (!props.row?.id && !String(value || '').trim()) {
          callback(new Error('请输入访问令牌'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

function resetForm() {
  Object.assign(form, {
    name: '',
    baseUrl: 'https://mineru.net',
    token: '',
    authMode: 'Bearer',
    modelVersion: 'vlm',
    createTaskPath: '/api/v4/extract/task',
    queryTaskPath: '/api/v4/extract/task/{task_id}',
    pollIntervalSeconds: 5,
    timeoutMinutes: 30,
    isOcr: true,
    enableFormula: true,
    enableTable: true,
    isEnabled: false,
  });
}

function fillForm(data: MineruConfig) {
  Object.assign(form, {
    name: data.name,
    baseUrl: data.baseUrl,
    token: '',
    authMode: data.authMode,
    modelVersion: data.modelVersion || 'vlm',
    createTaskPath: data.createTaskPath || '/api/v4/extract/task',
    queryTaskPath: data.queryTaskPath || '/api/v4/extract/task/{task_id}',
    pollIntervalSeconds: data.pollIntervalSeconds ?? 5,
    timeoutMinutes: data.timeoutMinutes ?? 30,
    isOcr: !!data.isOcr,
    enableFormula: !!data.enableFormula,
    enableTable: !!data.enableTable,
    isEnabled: !!data.isEnabled,
  });
}

watch(visible, async (value) => {
  if (!value) return;
  if (props.row?.id) {
    loading.value = true;
    try {
      fillForm(await getMineruConfig(props.row.id));
    } finally {
      loading.value = false;
    }
  } else {
    resetForm();
  }
});

function buildPayload() {
  const payload: MineruConfigForm = { ...form };
  if (props.row && !payload.token?.trim()) {
    delete payload.token;
  }
  return payload;
}

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateMineruConfig(props.row.id, buildPayload());
      ElMessage.success('更新成功');
    } else {
      await createMineruConfig(buildPayload());
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
    :title="props.row ? '编辑 MinerU 配置' : '新增 MinerU 配置'"
    width="820px"
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
    </div>
  </Dialog>
</template>
