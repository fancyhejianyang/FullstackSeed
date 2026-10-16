<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import Button from "@/components/Button.vue";
import { getPermissionActionColor } from "@/utils/permission";
import {
  createAgentApp,
  getAgentApp,
  getAgentConfigurationOptions,
  updateAgentApp,
  probeAgentMediaModel,
  type AgentMediaProbeResult,
  type AgentMediaModels,
  type AgentAccessScope,
  type AgentApp,
  type AgentAppForm,
  type AgentModelRouting,
  type AgentModelReference,
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
type MediaKind = keyof AgentMediaModels;
const mediaChecks = reactive<Partial<Record<MediaKind, AgentMediaProbeResult>>>(
  {},
);
const rejectedMedia = reactive(new Map<string, AgentMediaProbeResult>());
const probingKind = ref<MediaKind | null>(null);
const refreshingMedia = ref(false);
let probeVersion = 0;
let configurationVersion = 0;
let clearingRejected = false;
const mediaProps = {
  vision: "visionModel",
  imageGeneration: "imageGenerationModel",
} as const;
const mediaLabel = (kind: MediaKind) =>
  kind === "vision" ? "图片识别" : "图片生成";

type EditableForm = Omit<
  AgentAppForm,
  "allowedUserIds" | "modelRouting" | "mediaModels"
> &
  AgentModelRouting & {
    allowedUserIds: Array<string | number>;
    visionModel: string;
    imageGenerationModel: string;
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
  strategy: "balanced",
  visionModel: "",
  imageGenerationModel: "",
  simpleModels: [],
  complexModels: [],
  maxAttempts: 8,
  attemptTimeoutSeconds: 20,
  cooldownSeconds: 60,
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
    "示例数据、产品、SKU、标准问答、口语词库、文本知识库及知识库分类已接入查询/详情/受控新增。请按职责选用，接入不等于自动授权；写入须开启总开关并确认草稿。标准问答只建草稿，知识库不自动索引。模型尝试与业务工具次数独立限制。";
  const unavailable = unavailableSelectedTools.value;
  if (!unavailable.length) return base;
  return `${base} 当前保留了不可执行的历史配置，请手动移除后保存：${unavailable.map((item) => `${item.key}（${item.reason}）`).join("、")}。`;
});

function mediaKey(reference?: AgentModelReference | null) {
  return reference ? `${reference.providerId}:${reference.model}` : "";
}
function mediaReference(value: string): AgentModelReference | null {
  if (!value) return null;
  const separator = value.indexOf(":");
  return {
    providerId: Number(value.slice(0, separator)),
    model: value.slice(separator + 1),
  };
}
function mediaOptions(kind: "vision" | "imageGeneration", selected: string) {
  const list = (options.value.mediaModels?.[kind] ?? [])
    .filter((item) => item.providerId === Number(form.providerId))
    .filter((item) => !rejectedMedia.has(`${kind}:${mediaKey(item)}`))
    .map((item) => ({
      value: mediaKey(item),
      label: item.text,
      disabled: false,
    }));
  if (selected && !list.some((item) => item.value === selected))
    list.push({
      value: selected,
      label: `${selected}（引用已失效，请清除或重新选择）`,
      disabled: true,
    });
  return list;
}

const rejectedForProvider = computed(() =>
  [...rejectedMedia.values()].filter(
    (item) => item.providerId === Number(form.providerId),
  ),
);
const probeBusy = computed(() => !!probingKind.value || refreshingMedia.value);
function mediaCheckHint(kind: MediaKind) {
  if (probingKind.value === kind)
    return "正在发送真实图片测试请求，请等待；可能产生费用，关闭窗口不会保证供应商停止计费。";
  const check = mediaChecks[kind];
  if (check)
    return `${check.message}${check.cached ? "（60 秒内复用最近结果，未重复调用）" : ""}`;
  return "手动选择后自动测试，打开已有配置不自动调用。识图发送真实测试图片；生图实际生成一张，可能计费，不自动重试。";
}

function invalidateMediaProbe() {
  probeVersion++;
  probingKind.value = null;
  delete mediaChecks.vision;
  delete mediaChecks.imageGeneration;
}

async function checkMediaModel(kind: MediaKind) {
  const selected = form[mediaProps[kind]];
  const reference = mediaReference(selected);
  if (
    !reference ||
    reference.providerId !== Number(form.providerId) ||
    loading.value ||
    !visible.value
  )
    return;
  const version = ++probeVersion;
  probingKind.value = kind;
  delete mediaChecks[kind];
  try {
    const result = await probeAgentMediaModel({ ...reference, kind });
    if (
      version !== probeVersion ||
      !visible.value ||
      form[mediaProps[kind]] !== selected ||
      Number(form.providerId) !== reference.providerId
    )
      return;
    mediaChecks[kind] = result;
    if (result.status === "invalid") {
      rejectedMedia.set(`${kind}:${selected}`, result);
      clearingRejected = true;
      try {
        form[mediaProps[kind]] = "";
      } finally {
        clearingRejected = false;
      }
      ElMessage.warning(
        `${mediaLabel(kind)} ${reference.model} 已从当前候选移除，账号目录未修改`,
      );
    }
  } catch {
    if (version === probeVersion && visible.value) {
      mediaChecks[kind] = {
        ...reference,
        kind,
        status: "inconclusive",
        reason: "network",
        message:
          "请求未完成，无法判断图片能力；候选保留。请检查网络后重试，供应商可能已计费。",
        checkedAt: new Date().toISOString(),
        cached: false,
      };
    }
  } finally {
    if (version === probeVersion) probingKind.value = null;
  }
}

async function refreshMediaOptions() {
  if (probeBusy.value) return;
  const version = ++probeVersion;
  refreshingMedia.value = true;
  try {
    const configuration = await getAgentConfigurationOptions();
    if (version !== probeVersion || !visible.value) return;
    options.value = configuration;
    rejectedMedia.clear();
    delete mediaChecks.vision;
    delete mediaChecks.imageGeneration;
    ElMessage.success(
      "候选已按账号配置刷新，选择模型后测试；同配置 60 秒内复用最近结果",
    );
  } catch {
    // 统一请求层展示错误；保留当前候选与移除记录，避免刷新失败伪装成恢复成功。
  } finally {
    if (version === probeVersion) refreshingMedia.value = false;
  }
}

for (const kind of ["vision", "imageGeneration"] as const) {
  watch(
    () => form[mediaProps[kind]],
    (value) => {
      if (loading.value || !visible.value || clearingRejected) return;
      if (value) void checkMediaModel(kind);
      else {
        invalidateMediaProbe();
      }
    },
    { flush: "sync" },
  );
}
onBeforeUnmount(() => {
  configurationVersion++;
  invalidateMediaProbe();
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
    componentProps: { disabled: probeBusy.value },
    options: options.value.providers.map((item) => ({
      label: item.name,
      value: item.id,
    })),
    hint: "直接使用模型账号，不再依赖聊天配置；账号必须已启用并配置密钥。",
  },
  {
    prop: "models",
    label: "文本模型列表",
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
    hint: "最多选择 5 个授权模型，调度只在此范围内进行。限流、超时、额度异常时自动切换；同账号共享余额耗尽不能靠换模型解决。",
  },
  {
    prop: "strategy",
    label: "文本模型调度策略",
    type: "select",
    options: [
      { label: "优先顺序（主模型优先）", value: "priority" },
      { label: "均衡使用（按当前负载与轮转）", value: "balanced" },
      { label: "按意图与需求复杂度", value: "intent" },
    ],
    hint:
      form.strategy === "intent"
        ? "使用轻量组识别意图和复杂度，简单任务走轻量组，复杂任务走复杂组；识别失败保守走复杂组，各组内均衡调用。"
        : "当前策略不使用轻量/复杂模型分组。若要按任务难度选模型，请切换为‘按意图与需求复杂度’，下方将显示分组设置。",
  },
  ...(form.strategy === "intent"
    ? (["simpleModels", "complexModels"] as const).map(
        (prop): FormField => ({
          prop,
          label: prop === "simpleModels" ? "轻量任务模型组" : "复杂任务模型组",
          type: "selectMultiple",
          options: form.models.map((value) => ({ label: value, value })),
          componentProps: { maxTagCount: 5 },
          hint: "从上方已选模型中指定，不按模型名称猜测性能。首选组不可用时会尝试其余已选模型；两组相同则无法产生性能分层。",
        }),
      )
    : []),
  {
    prop: "maxAttempts",
    label: "模型阶段尝试上限",
    component: "InputNumber",
    componentProps: { mode: "integer", min: 3, max: 20 },
    hint: "本轮意图识别、动作规划、回答阶段的尝试共用此上限，与业务工具次数分离；按意图模式正常问答通常需要 3 次阶段尝试。",
  },
  {
    prop: "attemptTimeoutSeconds",
    label: "单次模型超时（秒）",
    component: "InputNumber",
    componentProps: { mode: "integer", min: 3, max: 120 },
    hint: "仅用于文本调度，受本轮总超时约束，自动给备用模型预留时间；不会无限重试。图片识别/生成使用下方的总超时，不自动重试。",
  },
  {
    prop: "cooldownSeconds",
    label: "失败冷却（秒）",
    component: "InputNumber",
    componentProps: { mode: "integer", min: 5, max: 3600 },
    hint: "冷却模型暂不参与调度，额度不足至少冷却 10 分钟。健康状态在当前后端进程内共享、重启清空，不代表供应商真实余额。",
  },
  {
    prop: "visionModel",
    label: "图片识别模型",
    type: "select",
    options: mediaOptions("vision", form.visionModel),
    placeholder: form.providerId
      ? "选择当前账号的视觉识别模型"
      : "请先选择模型账号",
    componentProps: {
      disabled: !form.providerId || probeBusy.value,
      notFoundText: "无可选识图模型，请更新大模型账号的视觉识别模型目录",
    },
    hint: `仅列出当前账号的视觉识别目录。${mediaCheckHint("vision")}`,
  },
  {
    prop: "imageGenerationModel",
    label: "图片生成模型",
    type: "select",
    options: mediaOptions("imageGeneration", form.imageGenerationModel),
    placeholder: form.providerId
      ? "选择当前账号的生图模型"
      : "请先选择模型账号",
    componentProps: {
      disabled: !form.providerId || probeBusy.value,
      notFoundText: "无生图候选：请配置该账号的生图模型、协议及完整接口地址",
    },
    hint: `来源为当前账号的生图目录与完整生图端点，不能从文本/视觉目录推断。${mediaCheckHint("imageGeneration")}`,
  },
  {
    prop: "mediaProbeControls",
    label: "图片模型测试",
    slot: true,
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
    hint: "仅限制业务工具操作，不含模型识别与重试。",
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
  simpleModels:
    form.strategy === "intent"
      ? [
          {
            required: true,
            type: "array",
            min: 1,
            message: "请选择轻量任务模型",
            trigger: "change",
          },
        ]
      : [],
  complexModels:
    form.strategy === "intent"
      ? [
          {
            required: true,
            type: "array",
            min: 1,
            message: "请选择复杂任务模型",
            trigger: "change",
          },
        ]
      : [],
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
    strategy: "balanced",
    visionModel: "",
    imageGenerationModel: "",
    simpleModels: [],
    complexModels: [],
    maxAttempts: 8,
    attemptTimeoutSeconds: 20,
    cooldownSeconds: 60,
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
    strategy: data.modelRouting?.strategy ?? "priority",
    visionModel: mediaKey(data.mediaModels?.vision),
    imageGenerationModel: mediaKey(data.mediaModels?.imageGeneration),
    simpleModels: [...(data.modelRouting?.simpleModels ?? [])],
    complexModels: [...(data.modelRouting?.complexModels ?? [])],
    maxAttempts: data.modelRouting?.maxAttempts ?? 8,
    attemptTimeoutSeconds: data.modelRouting?.attemptTimeoutSeconds ?? 20,
    cooldownSeconds: data.modelRouting?.cooldownSeconds ?? 60,
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
  (providerId, previous) => {
    if (loading.value || String(providerId) === String(previous)) return;
    invalidateMediaProbe();
    form.visionModel = "";
    form.imageGenerationModel = "";
    const available = new Set(
      options.value.providers
        .find((item) => item.id === Number(form.providerId))
        ?.models.map((item) => item.value) ?? [],
    );
    form.models = form.models.filter((model) => available.has(model));
  },
  { flush: "sync" },
);

watch(
  () => form.accessScope,
  (scope) => {
    if (scope === "all") form.allowedUserIds = [];
  },
);

watch(
  () => form.models,
  (models) => {
    form.simpleModels = form.simpleModels.filter((m) => models.includes(m));
    form.complexModels = form.complexModels.filter((m) => models.includes(m));
  },
  { deep: true },
);

watch(
  visible,
  async (value) => {
    const version = ++configurationVersion;
    invalidateMediaProbe();
    refreshingMedia.value = false;
    rejectedMedia.clear();
    if (!value) {
      loading.value = false;
      return;
    }
    loading.value = true;
    try {
      const [configuration, userResult] = await Promise.all([
        getAgentConfigurationOptions(),
        getUsers({ page: 1, pageSize: 1000, isActive: true }),
      ]);
      const app = props.row?.id ? await getAgentApp(props.row.id) : null;
      if (version !== configurationVersion || !visible.value) return;
      options.value = configuration;
      users.value = userResult.list;
      if (app) fillForm(app);
      else resetForm();
    } finally {
      if (version === configurationVersion) loading.value = false;
    }
  },
  { flush: "sync" },
);

function buildPayload(): AgentAppForm {
  return {
    name: form.name.trim(),
    responsibility: form.responsibility.trim(),
    instructionMarkdown: form.instructionMarkdown.trim(),
    providerId: form.providerId ? Number(form.providerId) : null,
    models: [...form.models],
    mediaModels: {
      vision: mediaReference(form.visionModel),
      imageGeneration: mediaReference(form.imageGenerationModel),
    },
    modelRouting: {
      strategy: form.strategy,
      simpleModels: [...form.simpleModels],
      complexModels: [...form.complexModels],
      maxAttempts: Number(form.maxAttempts),
      attemptTimeoutSeconds: Number(form.attemptTimeoutSeconds),
      cooldownSeconds: Number(form.cooldownSeconds),
    },
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
  if (probeBusy.value) {
    ElMessage.warning("请等待图片模型测试或候选刷新完成后再保存");
    return;
  }
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
      >
        <template #field-mediaProbeControls>
          <section class="agent-app-edit__media-tests" aria-live="polite">
            <p>
              图片模型测试：仅明确无效的选项会从当前窗口移除，不自动修改大模型账号。限流、超时、余额不足或结果无法核验时保留候选。
            </p>
            <div class="agent-app-edit__media-test-actions">
              <Button
                :type="getPermissionActionColor('read')"
                :disabled="probeBusy || loading"
                @click="refreshMediaOptions"
                >刷新模型候选</Button
              >
              <Button
                v-for="kind in ['vision', 'imageGeneration'] as const"
                :key="kind"
                :type="getPermissionActionColor('read')"
                :disabled="probeBusy || loading || !form[mediaProps[kind]]"
                @click="checkMediaModel(kind)"
                >重测{{ mediaLabel(kind) }}</Button
              >
            </div>
            <p
              v-for="item in rejectedForProvider"
              :key="`${item.kind}:${item.model}`"
            >
              已移除 {{ mediaLabel(item.kind) }}：{{ item.model }} ·
              {{ item.message }}
            </p>
          </section>
        </template>
      </Form>
    </div>
  </Dialog>
</template>

<style scoped>
.agent-app-edit__media-tests {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.agent-app-edit__media-test-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
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
