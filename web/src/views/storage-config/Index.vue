<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  getStorageConfig,
  updateStorageConfig,
  type StorageConfig,
} from '@/api/storageConfig';

const loading = ref(false);
const saving = ref(false);
const formRef = ref<InstanceType<typeof Form>>();

const form = reactive<StorageConfig>({
  enabled: false,
  provider: 'local',
  publicBaseUrl: '',
  bucket: '',
  region: '',
  endpoint: '',
  accessKeyId: '',
  accessKeySecret: '',
  uploadDir: 'uploads',
  updatedAt: '',
});

const providerOptions = [
  { label: '本地存储', value: 'local' },
  { label: '阿里云 OSS', value: 'aliyun-oss' },
  { label: '腾讯云 COS', value: 'tencent-cos' },
  { label: '七牛云 Kodo', value: 'qiniu' },
];

const fields: FormField[] = [
  {
    prop: 'enabled',
    label: '启用 OSS',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '本地' },
  },
  {
    prop: 'provider',
    label: '存储类型',
    type: 'select',
    options: providerOptions,
    componentProps: { clearable: false },
  },
  {
    prop: 'publicBaseUrl',
    label: '公开域名',
    type: 'input',
    placeholder: '如 https://cdn.example.com，留空则使用 /uploads',
  },
  {
    prop: 'uploadDir',
    label: '上传目录',
    type: 'input',
    placeholder: '如 uploads 或 tenant-a/uploads',
  },
  { prop: 'bucket', label: 'Bucket', type: 'input', placeholder: 'OSS/COS/Kodo Bucket 名称' },
  { prop: 'region', label: 'Region', type: 'input', placeholder: '如 oss-cn-hangzhou' },
  { prop: 'endpoint', label: 'Endpoint', type: 'input', placeholder: '如 https://oss-cn-hangzhou.aliyuncs.com' },
  { prop: 'accessKeyId', label: 'AccessKey', type: 'input' },
  {
    prop: 'accessKeySecret',
    label: 'Secret',
    type: 'input',
    inputMode: 'password',
    placeholder: '保存后仅用于服务端上传，后续可改为加密存储',
  },
];

const rules: FormRules = {
  provider: [{ required: true, message: '请选择存储类型', trigger: 'change' }],
  uploadDir: [{ required: true, message: '请输入上传目录', trigger: 'blur' }],
};

function fillForm(data: StorageConfig) {
  Object.assign(form, data);
}

async function fetchConfig() {
  loading.value = true;
  try {
    fillForm(await getStorageConfig());
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    fillForm(await updateStorageConfig({ ...form }));
    ElMessage.success('存储配置已保存');
  } finally {
    saving.value = false;
  }
}

onMounted(fetchConfig);
</script>

<template>
  <PageContainer title="OSS/CDN 配置">
    <el-alert
      class="storage-config__tip"
      type="info"
      :closable="false"
      show-icon
      title="上传接口始终返回前端可直接预览/下载的 URL；业务模块只保存这个地址。当前 OSS 分支已预留连接点，未接具体云 SDK 时会回退本地存储。"
    />

    <div v-loading="loading" class="storage-config">
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="120px"
      />

      <div class="storage-config__footer">
        <el-button type="primary" :loading="saving" @click="handleSave">
          保存配置
        </el-button>
        <el-text v-if="form.updatedAt" type="info">
          上次保存：{{ form.updatedAt }}
        </el-text>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
.storage-config {
  max-width: 760px;
}

.storage-config__tip {
  margin-bottom: 16px;
}

.storage-config__footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-left: 120px;
}
</style>
