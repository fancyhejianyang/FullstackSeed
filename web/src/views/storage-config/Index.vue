<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import PageContainer from "@/components/PageContainer.vue";
import Button from "@/components/Button.vue";
import Form, { type FormField } from "@/components/Form.vue";
import { getPermissionActionColor } from "@/utils/permission";
import {
  cleanupManagedFiles,
  getManagedCleanupPreview,
  getStorageConfig,
  updateStorageConfig,
  type ManagedCleanupPreview,
  type StorageConfig,
} from "@/api/storageConfig";
import { useUserStore } from "@/stores/user";

const user = useUserStore();

const loading = ref(false);
const saving = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const cleanupLoading = ref(false);
const cleanupPreview = ref<ManagedCleanupPreview | null>(null);
const canReadCleanup = computed(() => user.hasPermission("MediaStorage.read"));

const form = reactive<StorageConfig>({
  enabled: false,
  provider: "local",
  publicBaseUrl: "",
  bucket: "",
  region: "",
  endpoint: "",
  accessKeyId: "",
  accessKeySecret: "",
  uploadDir: "uploads",
  updatedAt: "",
});

const providerOptions = [
  { label: "本地存储", value: "local" },
  { label: "阿里云 OSS", value: "aliyun-oss" },
  { label: "腾讯云 COS", value: "tencent-cos" },
  { label: "七牛云 Kodo", value: "qiniu" },
];

const fields: FormField[] = [
  {
    prop: "enabled",
    label: "启用 OSS",
    component: "Switch",
    componentProps: { activeText: "启用", inactiveText: "本地" },
  },
  {
    prop: "provider",
    label: "存储类型",
    type: "select",
    options: providerOptions,
    componentProps: { clearable: false },
  },
  {
    prop: "publicBaseUrl",
    label: "公开域名",
    type: "input",
    placeholder: "如 https://cdn.example.com，留空则使用 /uploads",
  },
  {
    prop: "uploadDir",
    label: "上传目录",
    type: "input",
    placeholder: "如 uploads 或 tenant-a/uploads",
  },
  {
    prop: "bucket",
    label: "Bucket",
    type: "input",
    placeholder: "OSS/COS/Kodo Bucket 名称",
  },
  {
    prop: "region",
    label: "Region",
    type: "input",
    placeholder: "如 oss-cn-hangzhou",
  },
  {
    prop: "endpoint",
    label: "Endpoint",
    type: "input",
    placeholder: "如 https://oss-cn-hangzhou.aliyuncs.com",
  },
  {
    prop: "accessKeyId",
    label: "AccessKey",
    type: "input",
    inputMode: "password",
    placeholder: "留空保留已保存的 AccessKey",
  },
  {
    prop: "accessKeySecret",
    label: "Secret",
    type: "input",
    inputMode: "password",
    placeholder: "留空保留已保存的 Secret",
  },
];

const rules: FormRules = {
  provider: [{ required: true, message: "请选择存储类型", trigger: "change" }],
  uploadDir: [{ required: true, message: "请输入上传目录", trigger: "blur" }],
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

async function handleSave(clearCredentials = false) {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const { updatedAt, accessKeyIdSet, accessKeySecretSet, ...payload } = form;
    fillForm(await updateStorageConfig({ ...payload, clearCredentials }));
    ElMessage.success("存储配置已保存");
  } finally {
    saving.value = false;
  }
}

async function previewCleanup() {
  cleanupLoading.value = true;
  try {
    cleanupPreview.value = await getManagedCleanupPreview();
    if (!cleanupPreview.value.count)
      ElMessage.info("当前没有到期的可清理素材文件");
  } finally {
    cleanupLoading.value = false;
  }
}

async function runCleanup() {
  if (!cleanupPreview.value?.fileIds.length) return;
  cleanupLoading.value = true;
  try {
    const result = await cleanupManagedFiles(cleanupPreview.value.fileIds);
    ElMessage.success(
      `清理完成：删除 ${result.deleted} 个${result.failed ? `，失败 ${result.failed} 个` : ""}`,
    );
    cleanupPreview.value = await getManagedCleanupPreview();
  } finally {
    cleanupLoading.value = false;
  }
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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
      title="上传接口始终返回前端可直接预览/下载的 URL。当前已接入本地存储与阿里云 OSS；腾讯云 COS、七牛云 Kodo 尚未接入上传实现，不会静默回退。"
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
        <Button
          perm="StorageConfig.update"
          :type="getPermissionActionColor('update')"
          :loading="saving"
          @click="(_, done) => done(handleSave())"
        >
          保存配置
        </Button>
        <Button
          v-if="form.accessKeyIdSet || form.accessKeySecretSet"
          perm="StorageConfig.update"
          :auto-type="false"
          type="danger"
          :disabled="saving || loading"
          :confirm="true"
          confirm-text="清除已保存的存储凭据？依赖此配置的上传可能失败。"
          @click="(_, done) => done(handleSave(true))"
          >清除凭据</Button
        >
        <el-text type="info"
          >凭据{{
            form.accessKeyIdSet && form.accessKeySecretSet
              ? "已配置"
              : "未完整配置"
          }}</el-text
        >
        <el-text v-if="form.updatedAt" type="info">
          上次保存：{{ form.updatedAt }}
        </el-text>
      </div>

      <el-divider v-if="canReadCleanup" />
      <section v-if="canReadCleanup" class="storage-cleanup">
        <div>
          <h3>AI 素材文件清理</h3>
          <p>
            仅检查 AI
            素材专用路径中已登记、无引用且达到保留期的文件；不会扫描文章封面或历史上传目录。
          </p>
        </div>
        <div class="storage-cleanup__actions">
          <Button
            perm="MediaStorage.read"
            :loading="cleanupLoading"
            @click="previewCleanup"
          >
            预览清单
          </Button>
          <Button
            v-if="cleanupPreview?.count"
            perm="MediaStorage.update"
            :auto-type="false"
            type="danger"
            :loading="cleanupLoading"
            :confirm="true"
            :confirm-text="`确认精确删除预览中的 ${cleanupPreview.count} 个无引用文件？`"
            @click="(_, done) => done(runCleanup())"
          >
            执行清理
          </Button>
        </div>
        <el-alert
          v-if="cleanupPreview"
          :closable="false"
          type="info"
          :title="`可清理 ${cleanupPreview.count} 个，共 ${formatBytes(cleanupPreview.totalSize)}`"
        />
      </section>
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

.storage-cleanup {
  display: grid;
  gap: 14px;
}

.storage-cleanup h3,
.storage-cleanup p {
  margin: 0;
}

.storage-cleanup p {
  margin-top: 6px;
  color: #606266;
  line-height: 1.6;
}

.storage-cleanup__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
