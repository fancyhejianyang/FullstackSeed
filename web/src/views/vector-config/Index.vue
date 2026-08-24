<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  getCurrentVectorConfig,
  saveCurrentVectorConfig,
  type VectorConfig,
  type VectorConfigForm,
} from '@/api/vectorConfig';

const formRef = ref<InstanceType<typeof Form>>();
const loading = ref(false);
const submitting = ref(false);
const currentId = ref<number | null>(null);
const tokenSet = ref(false);
const loadedConfigName = ref('');

const form = reactive<VectorConfigForm>({
  name: '本地 Chroma 向量配置',
  vectorDbType: 'chroma',
  chromaUrl: 'http://localhost:8000',
  collectionName: 'knowledge_chunks',
  tenant: 'default_tenant',
  database: 'default_database',
  token: '',
  isEnabled: true,
});

const vectorDbTypeOptions = [{ label: 'Chroma', value: 'chroma' }];

const fields = computed<FormField[]>(() => [
  { prop: 'name', label: '配置名称', type: 'input', placeholder: '如 本地 Chroma 向量配置' },
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
    placeholder: tokenSet.value ? '已配置；留空表示不修改' : '本地服务通常可留空',
  },
  {
    prop: 'isEnabled',
    label: '是否启用',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
]);

const rules: FormRules = {
  name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  chromaUrl: [{ required: true, message: '请输入 Chroma 地址', trigger: 'blur' }],
};

function resetForm() {
  currentId.value = null;
  tokenSet.value = false;
  loadedConfigName.value = '';
  Object.assign(form, {
    name: '本地 Chroma 向量配置',
    vectorDbType: 'chroma',
    chromaUrl: 'http://localhost:8000',
    collectionName: 'knowledge_chunks',
    tenant: 'default_tenant',
    database: 'default_database',
    token: '',
    isEnabled: true,
  });
}

function fillForm(data: VectorConfig) {
  currentId.value = data.id;
  tokenSet.value = !!data.tokenSet;
  loadedConfigName.value = data.name;
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

async function loadConfig() {
  loading.value = true;
  try {
    const config = await getCurrentVectorConfig();
    if (!config) {
      resetForm();
      return;
    }
    fillForm(config);
  } catch {
    ElMessage.error('获取向量化配置失败');
  } finally {
    loading.value = false;
  }
}

function buildPayload() {
  const payload: VectorConfigForm = { ...form };
  if (currentId.value && !payload.token?.trim()) {
    delete payload.token;
  }
  return payload;
}

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    const payload = buildPayload();
    const isUpdate = !!currentId.value;
    const saved = await saveCurrentVectorConfig(payload);
    fillForm(saved);
    ElMessage.success(isUpdate ? '保存成功' : '创建成功');
  } finally {
    submitting.value = false;
  }
}

onMounted(loadConfig);
</script>

<template>
  <PageContainer title="向量化配置">
    <div class="vector-config" v-loading="loading">
      <div class="vector-config__header">
        <div>
          <h2>Chroma 向量服务</h2>
        </div>
        <el-tag :type="form.isEnabled ? 'success' : 'info'">
          {{ form.isEnabled ? '启用中' : '已停用' }}
        </el-tag>
      </div>

      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="120px"
      />

      <div class="vector-config__footer">
        <span class="vector-config__meta">
          {{ loadedConfigName ? `当前配置：${loadedConfigName}` : '当前配置：尚未创建' }}
        </span>
        <Button type="primary" icon="Check" :loading="submitting" @click="handleSubmit">
          保存配置
        </Button>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
.vector-config {
  max-width: 920px;
}

.vector-config__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.vector-config__header h2 {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.vector-config__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 8px;
}

.vector-config__meta {
  color: #909399;
}
</style>
