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
  businessTools: [],
});
const users = ref<UserItem[]>([]);

type EditableForm = Omit<AgentAppForm, "allowedUserIds"> & {
  allowedUserIds: Array<string | number>;
};

const DEFAULT_INSTRUCTION_MARKDOWN = `# 工作目标

请在这里说明 Agent 要完成的业务目标和边界。

## 处理流程

1. 先识别用户意图并确认必要信息。
2. 仅使用当前 Agent 已授权的业务工具。
3. 写入操作先展示待确认内容，员工确认后再提交。
4. 只有收到真实工具回执后才能说明操作成功。

## 业务规则

- 请在这里补充字段默认值、数量限制、异常处理等可调整规则。`;

const form = reactive<EditableForm>({
  name: "",
  responsibility: "",
  instructionMarkdown: DEFAULT_INSTRUCTION_MARKDOWN,
  providerId: null,
  models: [],
  toolKeys: [],
  accessScope: "all",
  allowedUserIds: [],
  isEnabled: true,
  writeEnabled: false,
  maxToolCalls: 5,
  timeoutSeconds: 60,
  maxConcurrentRuns: 1,
});

const unavailableSelectedTools = computed(() => {
  const toolMap = new Map(
    options.value.businessTools.map((item) => [item.commandKey, item]),
  );
  return form.toolKeys.flatMap((key) => {
    const tool = toolMap.get(key);
    if (tool?.runtimeAvailable) return [];
    return [
      {
        key,
        reason: tool?.unavailableReason || "指令未启用或不允许聊天调用",
      },
    ];
  });
});

const businessToolOptions = computed(() => {
  const selected = new Set(form.toolKeys);
  const knownKeys = new Set(
    options.value.businessTools.map((item) => item.commandKey),
  );
  return [
    ...options.value.businessTools.map((item) => ({
      label: `${item.name}（${item.commandKey}）${item.requireApproval ? " · 需确认" : ""}${item.runtimeAvailable ? "" : ` · ${item.unavailableReason || "暂不可执行"}`}`,
      value: item.commandKey,
      // 已保存的不可用工具仍保留回显并允许取消；移除后不能再次选入。
      disabled: !item.runtimeAvailable && !selected.has(item.commandKey),
    })),
    ...form.toolKeys
      .filter((key) => !knownKeys.has(key))
      .map((key) => ({
        label: `${key} · 指令未启用或不允许聊天调用（请移除）`,
        value: key,
        disabled: false,
      })),
  ];
});

const businessToolHint = computed(() => {
  const base =
    "仅已接入 Agent 执行器的工具可选；写入工具须同时开启写入总开关，员工确认并通过业务权限校验后才可提交。";
  const unavailable = unavailableSelectedTools.value;
  if (!unavailable.length) return base;
  return `${base} 当前保留了不可执行的历史配置，请手动移除后保存：${unavailable.map((item) => `${item.key}（${item.reason}）`).join("、")}。`;
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
    prop: "instructionMarkdown",
    label: "工作指令（Markdown）",
    type: "textarea",
    rows: 14,
    labelPosition: "top",
    placeholder: "使用 Markdown 编写工作目标、处理流程和可调整的业务规则",
    componentProps: {
      maxlength: 20000,
      showWordLimit: true,
      clearable: false,
      resize: "vertical",
    },
    hint: "这里负责描述工作逻辑，不直接定义接口；Agent 只能调用下方已授权的业务工具，权限、确认和真实回执仍由平台强制校验。",
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
      options.value.providers.find(
        (item) => item.id === Number(form.providerId),
      )?.models ?? [],
    componentProps: {
      disabled: !form.providerId,
      maxTagCount: 5,
      maxSelections: 5,
      visibleCount: 10,
    },
    hint: "按选择顺序调用：首个模型为主模型，失败时依次尝试后续模型，最多选择 5 个且受单轮工具上限约束。",
  },
  {
    prop: "toolKeys",
    label: "业务工具（可选）",
    type: "selectMultiple",
    options: businessToolOptions.value,
    componentProps: { visibleCount: 10 },
    hint: businessToolHint.value,
  },
  {
    prop: "writeEnabled",
    label: "写入总开关",
    component: "Switch",
    componentProps: { activeText: "允许受控录入", inactiveText: "仅只读" },
    hint: "开启时至少选择一个可执行的写入工具；关闭后不执行写入，保留已选工具配置。选择工具不会自动开启此开关。",
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

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: "请输入 Agent 名称", trigger: "blur" }],
  responsibility: [
    { required: true, message: "请输入职责说明", trigger: "blur" },
  ],
  instructionMarkdown: [
    { required: true, message: "请输入 Markdown 工作指令", trigger: "blur" },
    {
      max: 20000,
      message: "工作指令不能超过 20000 个字符",
      trigger: "blur",
    },
  ],
  providerId: [
    { required: true, message: "请选择模型账号", trigger: "change" },
  ],
  models: [
    { required: true, message: "请至少选择一个模型", trigger: "change" },
    {
      type: "array",
      max: 5,
      message: "模型列表最多选择 5 项",
      trigger: "change",
    },
  ],
}));

function resetForm() {
  Object.assign(form, {
    name: "",
    responsibility: "",
    instructionMarkdown: DEFAULT_INSTRUCTION_MARKDOWN,
    providerId:
      options.value.providers.length === 1
        ? options.value.providers[0].id
        : null,
    models: [],
    toolKeys: [] as AgentToolKey[],
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
    instructionMarkdown:
      data.instructionMarkdown || DEFAULT_INSTRUCTION_MARKDOWN,
    providerId: data.providerId,
    models: [...data.models],
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
    instructionMarkdown: form.instructionMarkdown.trim(),
    providerId: form.providerId ? Number(form.providerId) : null,
    models: [...form.models],
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
  if (unavailableSelectedTools.value.length) {
    ElMessage.warning("请先手动移除业务工具中标记为不可执行的历史选项");
    return;
  }
  if (
    form.writeEnabled &&
    !options.value.businessTools.some(
      (item) =>
        item.runtimeAvailable &&
        item.requireApproval &&
        form.toolKeys.includes(item.commandKey),
    )
  ) {
    ElMessage.warning("开启写入前，请至少选择一个已接入执行器的写入工具");
    return;
  }
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
