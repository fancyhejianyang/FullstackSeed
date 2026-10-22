<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import {
  createComfyConnection,
  getComfyConnection,
  updateComfyConnection,
  type ComfyConnection,
  type ComfyConnectionForm,
} from "@/api/comfyUi";

const props = defineProps<{ row?: ComfyConnection | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>("visible", { required: true });
const formRef = ref<InstanceType<typeof Form>>();
const loading = ref(false);
const submitting = ref(false);
const secretConfigured = ref(false);
const form = reactive<ComfyConnectionForm>({
  name: "",
  baseUrl: "http://127.0.0.1:8188",
  authType: "none",
  username: "",
  secret: "",
  requestTimeoutMs: 15000,
  taskTimeoutSec: 1800,
  maxConcurrency: 1,
  isEnabled: true,
  isDefault: false,
  description: "",
});

const fields = computed<FormField[]>(() => [
  {
    prop: "name",
    label: "配置名称",
    type: "input",
    placeholder: "如 本机 ComfyUI",
  },
  {
    prop: "baseUrl",
    label: "服务地址",
    type: "input",
    placeholder: "http://127.0.0.1:8188 或 https://cloud.example.com",
    hint: "本机可使用 localhost、回环、host.docker.internal 或私有网地址；云端服务请使用 HTTPS，并按服务要求配置认证。",
  },
  {
    prop: "authType",
    label: "认证方式",
    type: "select",
    options: [
      { label: "无认证", value: "none" },
      { label: "账号密码（Basic）", value: "basic" },
      { label: "访问令牌（Bearer）", value: "bearer" },
    ],
  },
  ...(form.authType === "basic"
    ? [
        {
          prop: "username",
          label: "账号",
          type: "input" as const,
          placeholder: "反向代理账号",
        },
      ]
    : []),
  ...(form.authType !== "none"
    ? [
        {
          prop: "secret",
          label: form.authType === "basic" ? "密码" : "访问令牌",
          type: "input" as const,
          inputMode: "password" as const,
          placeholder: secretConfigured.value
            ? "已配置；留空表示不修改"
            : "请输入认证信息",
        },
      ]
    : []),
  {
    prop: "requestTimeoutMs",
    label: "请求超时",
    component: "InputNumber",
    componentProps: {
      mode: "integer",
      min: 1000,
      max: 120000,
      suffixText: "毫秒",
    },
  },
  {
    prop: "taskTimeoutSec",
    label: "任务观察时限",
    component: "InputNumber",
    componentProps: { mode: "integer", min: 30, max: 86400, suffixText: "秒" },
  },
  {
    prop: "maxConcurrency",
    label: "最大并发",
    component: "InputNumber",
    componentProps: { mode: "integer", min: 1, max: 8 },
    hint: "首期调度器按服务串行执行；该字段为后续多任务调度保留。",
  },
  {
    prop: "isDefault",
    label: "默认服务",
    component: "Switch",
    componentProps: { activeText: "默认", inactiveText: "普通" },
  },
  {
    prop: "isEnabled",
    label: "是否启用",
    component: "Switch",
    componentProps: { activeText: "启用", inactiveText: "停用" },
  },
  { prop: "description", label: "备注", type: "textarea", rows: 3 },
]);
const rules: FormRules = {
  name: [{ required: true, message: "请输入配置名称", trigger: "blur" }],
  baseUrl: [{ required: true, message: "请输入服务地址", trigger: "blur" }],
  authType: [{ required: true, message: "请选择认证方式", trigger: "change" }],
};

function reset() {
  secretConfigured.value = false;
  Object.assign(form, {
    name: "",
    baseUrl: "http://127.0.0.1:8188",
    authType: "none",
    username: "",
    secret: "",
    requestTimeoutMs: 15000,
    taskTimeoutSec: 1800,
    maxConcurrency: 1,
    isEnabled: true,
    isDefault: false,
    description: "",
  });
}
watch(visible, async (open) => {
  if (!open) return;
  reset();
  if (!props.row) return;
  loading.value = true;
  try {
    const detail = await getComfyConnection(props.row.id);
    secretConfigured.value = !!detail.secretConfigured;
    Object.assign(form, {
      name: detail.name,
      baseUrl: detail.baseUrl,
      authType: detail.authType,
      username: detail.username || "",
      secret: "",
      requestTimeoutMs: detail.requestTimeoutMs,
      taskTimeoutSec: detail.taskTimeoutSec,
      maxConcurrency: detail.maxConcurrency,
      isEnabled: detail.isEnabled,
      isDefault: detail.isDefault,
      description: detail.description || "",
    });
  } finally {
    loading.value = false;
  }
});
async function submit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    const payload = { ...form };
    if (props.row && !payload.secret?.trim()) delete payload.secret;
    if (payload.authType === "none") {
      payload.username = "";
      payload.clearSecret = true;
    }
    if (props.row) await updateComfyConnection(props.row.id, payload);
    else await createComfyConnection(payload);
    ElMessage.success(props.row ? "保存成功" : "创建成功");
    visible.value = false;
    emit("success");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model="visible"
    :title="row ? '编辑 ComfyUI 服务' : '新增 ComfyUI 服务'"
    width="760px"
    :confirm-loading="submitting"
    @confirm="submit"
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
