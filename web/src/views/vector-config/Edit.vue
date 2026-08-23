<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  createVectorConfig,
  getVectorConfig,
  updateVectorConfig,
  type VectorConfig,
  type VectorConfigForm,
} from '@/api/vectorConfig';

const props = defineProps<{
  row?: VectorConfig | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();

const form = reactive<VectorConfigForm>({
  name: '',
  vectorDbType: 'chroma',
  chromaUrl: 'http://localhost:8000',
  collectionName: 'knowledge_chunks',
  tenant: 'default_tenant',
  database: 'default_database',
  token: '',
  isEnabled: false,
});

const vectorDbTypeOptions = [{ label: 'Chroma', value: 'chroma' }];

const fields: FormField[] = [
  { prop: 'name', label: '配置名称', type: 'input', placeholder: '如 本地 Chroma 配置' },
  {
    prop: 'vectorDbType',
    label: '数据库类型',
    type: 'select',
    options: vectorDbTypeOptions,
    componentProps: { clearable: false },
  },
  {
    prop: 'chromaUrl',
    label: 'Chroma 地址',
    type: 'input',
    placeholder: 'http://localhost:8000',
  },
  {
    prop: 'collectionName',
    label: 'Collection',
    type: 'input',
    placeholder: 'knowledge_chunks',
  },
  { prop: 'tenant', label: 'Tenant', type: 'input', placeholder: 'default_tenant' },
  {
    prop: 'database',
    label: 'Database',
    type: 'input',
    placeholder: 'default_database',
  },
  {
    prop: 'token',
    label: '访问令牌',
    type: 'input',
    inputMode: 'password',
    placeholder: '编辑时留空表示不修改',
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
  chromaUrl: [{ required: true, message: '请输入 Chroma 地址', trigger: 'blur' }],
};

function resetForm() {
  Object.assign(form, {
    name: '',
    vectorDbType: 'chroma',
    chromaUrl: 'http://localhost:8000',
    collectionName: 'knowledge_chunks',
    tenant: 'default_tenant',
    database: 'default_database',
    token: '',
    isEnabled: false,
  });
}

function fillForm(data: VectorConfig) {
  Object.assign(form, {
    name: data.name,
    vectorDbType: data.vectorDbType,
    chromaUrl: data.chromaUrl,
    collectionName: data.collectionName || 'knowledge_chunks',
    tenant: data.tenant || 'default_tenant',
    database: data.database || 'default_database',
    token: '',
    isEnabled: !!data.isEnabled,
  });
}

watch(visible, async (value) => {
  if (!value) return;
  if (props.row?.id) {
    loading.value = true;
    try {
      fillForm(await getVectorConfig(props.row.id));
    } finally {
      loading.value = false;
    }
  } else {
    resetForm();
  }
});

function buildPayload() {
  const payload: VectorConfigForm = { ...form };
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
      await updateVectorConfig(props.row.id, buildPayload());
      ElMessage.success('更新成功');
    } else {
      await createVectorConfig(buildPayload());
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
    :title="props.row ? '编辑向量化配置' : '新增向量化配置'"
    width="760px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="120px"
      />
    </div>
  </Dialog>
</template>
