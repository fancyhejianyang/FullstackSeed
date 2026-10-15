<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import {
  createAgentApp,
  getAgentApp,
  getAgentConfigurationOptions,
  updateAgentApp,
  type AgentAccessScope,
  type AgentApp,
  type AgentAppForm,
  type AgentConfigurationOptions,
  type AgentToolKey,
} from "@/api/agentApp";
import { getUsers, type UserItem } from "@/api/user";

const props = defineProps<{ row?: AgentApp | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>("visible", { required: true });

const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const options = ref<AgentConfigurationOptions>({
  providers: [],
  workflows: [],
});
const users = ref<UserItem[]>([]);

type EditableForm = Omit<AgentAppForm, "allowedUserIds"> & {
  allowedUserIds: Array<string | number>;
};

const form = reactive<EditableForm>({
  name: "",
  responsibility: "",
  providerId: null,
  models: [],
  workflowId: null,
  toolKeys: ["knowledge.answer"],
  accessScope: "all",
  allowedUserIds: [],
  isEnabled: true,
  writeEnabled: false,
  maxToolCalls: 5,
  timeoutSeconds: 60,
  maxConcurrentRuns: 1,
});

const fields = computed<FormField[]>(() => [
  {
    prop: "name",
    label: "Agent 名称",
    type: "input",
    placeholder: "如 产品资料助手",
  },
  {
    prop: "responsibility",
    label: "职责说明",
    type: "textarea",
    rows: 3,
    placeholder: "说明该 Agent 可回答、查询和录入的业务边界",
  },
  {
    prop: "providerId",
    label: "模型账号",
    type: "select",
    placeholder: "请选择已启用的模型账号",
    options: options.value.providers.map((item) => ({
      label: item.name,
      value: item.id,
    })),
    hint: "直接使用模型账号，不再依赖聊天配置；账号必须已启用并配置密钥。",
  },
  {
    prop: "models",
    label: "模型列表",
    type: "selectMultiple",
    placeholder: form.providerId ? "请选择一个或多个模型" : "请先选择模型账号",
    options:
      options.value.providers.find((item) => item.id === Number(form.providerId))
        ?.models ?? [],
    componentProps: {
      disabled: !form.providerId,
      maxTagCount: 5,
      visibleCount: 10,
    },
    hint: "按选择顺序调用：首个模型为主模型，失败时依次尝试后续模型，最多选择 5 个且受单轮工具上限约束。",
  },
  {
    prop: "workflowId",
    label: "知识工作流",
    type: "select",
    options: options.value.workflows.map((item) => ({
      label: item.name,
      value: item.id,
    })),
  },
  {
    prop: "toolKeys",
    label: "工具白名单",
    type: "selectMultiple",
    options: [
      { label: "知识问答（knowledge.answer）", value: "knowledge.answer" },
      { label: "产品/SKU 查询（product.query）", value: "product.query" },
      { label: "新增 SKU（productSku.create）", value: "productSku.create" },
    ],
    hint: "查询与写入分开授权；新增 SKU 始终需要员工确认和 ProductSku.create 权限。",
  },
  {
    prop: "writeEnabled",
    label: "写入总开关",
    component: "Switch",
    componentProps: { activeText: "允许受控录入", inactiveText: "仅只读" },
  },
  {
    prop: "accessScope",
    label: "使用范围",
    type: "select",
    options: [
      { label: "所有有工作台权限的员工", value: "all" },
      { label: "指定员工", value: "users" },
    ],
  },
  {
    prop: "allowedUserIds",
    label: "指定员工",
    type: "selectMultiple",
    options: users.value.map((item) => ({
      label: `${item.nickname || item.username}（${item.username}）`,
      value: item.id,
    })),
    componentProps: { disabled: form.accessScope !== "users" },
  },
  {
    prop: "maxToolCalls",
    label: "单轮工具上限",
    component: "InputNumber",
    componentProps: { mode: "integer", min: 1, max: 20 },
  },
  {
    prop: "timeoutSeconds",
    label: "超时秒数",
    component: "InputNumber",
    componentProps: { mode: "integer", min: 10, max: 300 },
  },
  {
    prop: "maxConcurrentRuns",
    label: "员工并发上限",
    component: "InputNumber",
    componentProps: { mode: "integer", min: 1, max: 20 },
  },
  {
    prop: "isEnabled",
    label: "是否启用",
    component: "Switch",
    componentProps: { activeText: "启用", inactiveText: "停用" },
  },
]);

const rules: FormRules = {
  name: [{ required: true, message: "请输入 Agent 名称", trigger: "blur" }],
  responsibility: [
    { required: true, message: "请输入职责说明", trigger: "blur" },
  ],
  providerId: [
    { required: true, message: "请选择模型账号", trigger: "change" },
  ],
  models: [
    { required: true, message: "请至少选择一个模型", trigger: "change" },
  ],
  workflowId: [
    { required: true, message: "请选择知识工作流", trigger: "change" },
  ],
  toolKeys: [
    { required: true, message: "请至少选择一项工具", trigger: "change" },
  ],
};

function resetForm() {
  Object.assign(form, {
    name: "",
    responsibility: "",
    providerId:
      options.value.providers.length === 1
        ? options.value.providers[0].id
        : null,
    models: [],
    workflowId:
      options.value.workflows.length === 1
        ? options.value.workflows[0].id
        : null,
    toolKeys: ["knowledge.answer"] as AgentToolKey[],
    accessScope: "all" as AgentAccessScope,
    allowedUserIds: [],
    isEnabled: true,
    writeEnabled: false,
    maxToolCalls: 5,
    timeoutSeconds: 60,
    maxConcurrentRuns: 1,
  });
}

function fillForm(data: AgentApp) {
  Object.assign(form, {
    name: data.name,
    responsibility: data.responsibility,
    providerId: data.providerId,
    models: [...data.models],
    workflowId: data.workflowId,
    toolKeys: [...data.toolKeys],
    accessScope: data.accessScope,
    allowedUserIds: [...(data.allowedUserIds ?? [])],
    isEnabled: !!data.isEnabled,
    writeEnabled: !!data.writeEnabled,
    maxToolCalls: data.maxToolCalls,
    timeoutSeconds: data.timeoutSeconds,
    maxConcurrentRuns: data.maxConcurrentRuns,
  });
}

watch(
  () => form.providerId,
  () => {
    const available = new Set(
      options.value.providers
        .find((item) => item.id === Number(form.providerId))
        ?.models.map((item) => item.value) ?? [],
    );
    form.models = form.models.filter((model) => available.has(model));
  },
);

watch(
  () => form.writeEnabled,
  (enabled) => {
    const keys = new Set(form.toolKeys);
    if (enabled) keys.add("productSku.create");
    else keys.delete("productSku.create");
    form.toolKeys = Array.from(keys) as AgentToolKey[];
  },
);

watch(
  () => form.accessScope,
  (scope) => {
    if (scope === "all") form.allowedUserIds = [];
  },
);

watch(visible, async (value) => {
  if (!value) return;
  loading.value = true;
  try {
    const [configuration, userResult] = await Promise.all([
      getAgentConfigurationOptions(),
      getUsers({ page: 1, pageSize: 1000, isActive: true }),
    ]);
    options.value = configuration;
    users.value = userResult.list;
    if (props.row?.id) fillForm(await getAgentApp(props.row.id));
    else resetForm();
  } finally {
    loading.value = false;
  }
});

function buildPayload(): AgentAppForm {
  return {
    name: form.name.trim(),
    responsibility: form.responsibility.trim(),
    providerId: form.providerId ? Number(form.providerId) : null,
    models: [...form.models],
    workflowId: form.workflowId ? Number(form.workflowId) : null,
    toolKeys: [...form.toolKeys],
    accessScope: form.accessScope,
    allowedUserIds:
      form.accessScope === "users" ? form.allowedUserIds.map(Number) : [],
    isEnabled: form.isEnabled,
    writeEnabled: form.writeEnabled,
    maxToolCalls: Number(form.maxToolCalls),
    timeoutSeconds: Number(form.timeoutSeconds),
    maxConcurrentRuns: Number(form.maxConcurrentRuns),
  };
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (form.accessScope === "users" && !form.allowedUserIds.length) {
    ElMessage.warning("请至少选择一名可使用员工");
    return;
  }
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateAgentApp(props.row.id, buildPayload());
      ElMessage.success("Agent 应用已更新");
    } else {
      await createAgentApp(buildPayload());
      ElMessage.success("Agent 应用已创建");
    }
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
    :title="props.row ? '编辑 Agent 应用' : '新增 Agent 应用'"
    width="820px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading" class="agent-app-edit">
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="168px"
      />
    </div>
  </Dialog>
</template>

<style scoped>
.agent-app-edit :deep(.el-form-item__label) {
  white-space: nowrap;
}

.agent-app-edit :deep(.select-multiple__tag) {
  max-width: 100%;
  height: auto;
  min-height: 24px;
  overflow: visible;
  line-height: 20px;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
}
</style>
