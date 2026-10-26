<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { isAxiosError } from "axios";
import { ElMessage, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import Button from "@/components/Button.vue";
import {
  FeatureModelTestQueue,
  FeatureModelTestHistory,
} from "@/utils/featureModelTest";
import {
  removedModelMatchesSelection,
  removeRetiredModelOptions,
} from "@/utils/retiredModelOptions";
import { getPermissionActionColor } from "@/utils/permission";
import {
  createAiFeatureConfig,
  checkAiFeatureModelEndpoint,
  getAiFeatureConfig,
  updateAiFeatureConfig,
  type AiFeatureConfig,
  type AiFeatureConfigForm,
  type AiFeatureType,
  type AiFeatureModelEndpointCheck,
  type AiFeatureModelEndpointResult,
  type AiFeatureModelTestResult,
  testAiFeatureModel,
  queryAiFeatureModelTest,
  listAiFeatureModelTests,
} from "@/api/aiFeatureConfig";
import {
  getThirdPartyOptions,
  type ProviderOption,
  type MineruOption,
} from "@/api/thirdPartyConfig";

const props = defineProps<{
  row?: AiFeatureConfig | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>("visible", { required: true });
const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const providers = ref<ProviderOption[]>([]);
const mineruConfigs = ref<MineruOption[]>([]);
const formReadyForModelValidation = ref(false);
const validatingModel = ref(false);
const modelValidationHint = ref("");
let modelValidationSequence = 0;
let dialogSession = 0;
let retiredOptionsSequence = 0;
const appliedModelRemovals = new Set<string>();
const modelTestHint = ref("");
const modelTests = ref<AiFeatureModelTestResult[]>([]);
const testSubmissionBusy = ref(false);
const testQueued = ref(false);
const queryingTests = ref<string[]>([]);
const latestTestRequestId = ref("");
const recentTestsError = ref("");
const modelTestHistory =
  new FeatureModelTestHistory<AiFeatureModelTestResult>();
const checkedEndpoint = ref<AiFeatureModelEndpointResult | null>(null);
let modelTestPollTimer: ReturnType<typeof setTimeout> | undefined;
const testLabels = {
  running: "调用中",
  accepted: "已受理，尚未完成",
  succeeded: "测试成功",
  failed: "测试失败",
  unknown: "结果待核实",
};
type FeatureTestJob = {
  selection: AiFeatureModelEndpointCheck;
  requestId: string;
  startedAt: number;
  sent: boolean;
};
const modelTestQueue = new FeatureModelTestQueue<
  FeatureTestJob,
  AiFeatureModelTestResult | null
>({
  canReuseActive: (job) => job.sent,
  run: async (job, context) => {
    if (!context.isCurrent()) return null;
    if (!(await validateSelectedModel())) {
      if (context.isCurrent()) {
        modelTestHint.value =
          modelValidationHint.value || "接口匹配未通过，未发起实际测试。";
        ElMessage.error(modelTestHint.value);
      }
      return null;
    }
    if (!context.isCurrent()) return null;
    job.startedAt = Date.now();
    job.sent = true;
    latestTestRequestId.value = job.requestId;
    modelTestHint.value = `已匹配接口，正在实际测试“${job.selection.model}”…`;
    storeModelTest(
      {
        ...job.selection,
        requestId: job.requestId,
        status: "running",
        message: "正在实际调用所选模型。",
        httpStatus: null,
        responseBody: "",
        taskId: null,
        elapsedMilliseconds: 0,
        checkedAt: new Date().toISOString(),
        apiPath: checkedEndpoint.value?.apiPath,
        ruleName: checkedEndpoint.value?.ruleName,
      },
      true,
    );
    return testAiFeatureModel({ ...job.selection, requestId: job.requestId });
  },
  onResult: (job, result, context) => {
    if (!result) return;
    const stored = storeModelTest(result);
    const current =
      context.isCurrent() &&
      selectionKey(job.selection) === selectionKey(currentTestSelection());
    const cleared = applyLiveModelRemoval(stored);
    if (current || cleared) {
      latestTestRequestId.value = result.requestId;
      modelTestHint.value = `${testLabels[stored.status]}：${stored.message}`;
      notifyModelTest(stored);
      scheduleModelTestPoll(stored);
    }
  },
  onError: (job, error, context) => {
    if (!job.sent) return;
    const status = isAxiosError(error) ? error.response?.status : undefined;
    const rejected =
      status !== undefined && status >= 400 && status < 500 && status !== 408;
    const result: AiFeatureModelTestResult = {
      ...job.selection,
      requestId: job.requestId,
      status: rejected ? "failed" : "unknown",
      message: `${modelTestError(error)}${rejected ? "" : " 供应商可能已受理，请先查询原测试结果；不会自动重投。"}`,
      httpStatus: status ?? null,
      responseBody: "",
      taskId: null,
      elapsedMilliseconds: Date.now() - job.startedAt,
      checkedAt: new Date().toISOString(),
    };
    const stored = storeModelTest(result, true);
    if (context.isCurrent()) {
      latestTestRequestId.value = job.requestId;
      modelTestHint.value = `${testLabels[stored.status]}：${stored.message}`;
      if (status !== 401 && stored === result) notifyModelTest(stored);
    }
  },
  onState: (busy, queued) => {
    testSubmissionBusy.value = busy;
    testQueued.value = queued;
  },
});

function modelTestError(error: unknown) {
  const value: unknown = isAxiosError(error)
    ? error.response?.data?.message
    : error instanceof Error
      ? error.message
      : null;
  return typeof value === "string"
    ? value
    : "测试请求未完成，请稍后查询原结果。";
}
function currentTestSelection(): AiFeatureModelEndpointCheck {
  return {
    providerId: Number(form.providerId),
    model: form.model?.trim() ?? "",
    featureType: form.featureType,
    useMineru: isMineruOcrFeature.value,
  };
}
function selectionKey(selection: Partial<AiFeatureModelEndpointCheck>) {
  return JSON.stringify([
    selection.providerId,
    selection.model,
    selection.featureType,
    !!selection.useMineru,
    selection.webSearchMode ?? "disabled",
  ]);
}
function storeModelTest(
  result: AiFeatureModelTestResult,
  local = false,
  prioritize = true,
) {
  const records = modelTestHistory.store(result, local, prioritize);
  modelTests.value = records;
  return records.find((item) => item.requestId === result.requestId) ?? result;
}
function notifyModelTest(result: AiFeatureModelTestResult) {
  const text = `模型“${result.model ?? "未知"}”：${testLabels[result.status]}。${result.message}`;
  if (result.status === "succeeded") ElMessage.success(text);
  else if (result.status === "failed") ElMessage.error(text);
  else if (result.status === "unknown") ElMessage.warning(text);
  else ElMessage.info(text);
}
function clearRemovedModelSelection(result: AiFeatureModelTestResult) {
  if (!removedModelMatchesSelection(result, form.providerId, form.model))
    return false;
  // 清空触发原有 watcher 取消待测任务，不自动补选或测试其它模型。
  form.model = "";
  latestTestRequestId.value = result.requestId;
  modelTestHint.value = `${testLabels[result.status]}：${result.message}`;
  return true;
}
function applyLiveModelRemoval(result: AiFeatureModelTestResult) {
  if (
    !visible.value ||
    result.modelRemoved !== true ||
    appliedModelRemovals.has(result.requestId)
  )
    return false;
  retiredOptionsSequence += 1;
  appliedModelRemovals.add(result.requestId);
  providers.value = removeRetiredModelOptions(providers.value, result);
  return clearRemovedModelSelection(result);
}
async function refreshRetiredModelOptions(
  records: AiFeatureModelTestResult[],
  session = dialogSession,
) {
  const removed = records.filter(
    (result) =>
      result.modelRemoved === true && result.providerId && result.model,
  );
  if (!removed.length || !visible.value) return false;
  const sequence = ++retiredOptionsSequence;
  try {
    const options = await getThirdPartyOptions({ silentError: true });
    if (
      session !== dialogSession ||
      !visible.value ||
      sequence !== retiredOptionsSequence
    )
      return false;
    const providerIds = new Set(removed.map((item) => item.providerId));
    // 历史移除记录不能覆盖管理员后来重新加入的模型，以当前服务端目录为准。
    providers.value = providers.value.map((provider) =>
      providerIds.has(provider.id)
        ? (options.providers.find((item) => item.id === provider.id) ??
          provider)
        : provider,
    );
    const current = removed.find(
      (result) =>
        removedModelMatchesSelection(result, form.providerId, form.model) &&
        !modelOptions.value.some((item) => item.value === form.model),
    );
    return current ? clearRemovedModelSelection(current) : false;
  } catch {
    // 移除已由后端持久化；读取失败不回放旧删除，也不重新提交供应商请求。
    return false;
  }
}
function stopModelTestPoll() {
  if (modelTestPollTimer) clearTimeout(modelTestPollTimer);
  modelTestPollTimer = undefined;
}
function scheduleModelTestPoll(result: AiFeatureModelTestResult) {
  stopModelTestPoll();
  if (
    !visible.value ||
    result.requestId !== latestTestRequestId.value ||
    !["running", "accepted"].includes(result.status)
  )
    return;
  const age =
    result.elapsedMilliseconds +
    Math.max(0, Date.now() - Date.parse(result.checkedAt));
  if (age >= 15 * 60000) {
    const stopped = {
      ...result,
      status: "unknown" as const,
      message:
        "已停止自动查询，供应商任务可能继续；请手动查询原测试结果，不会重新生成。",
    };
    storeModelTest(stopped, true);
    modelTestHint.value = stopped.message;
    notifyModelTest(stopped);
    return;
  }
  modelTestPollTimer = setTimeout(() => {
    void queryModelTest(result, false);
  }, 3000);
}
async function queryModelTest(
  record: AiFeatureModelTestResult,
  explicit = true,
) {
  if (!visible.value || queryingTests.value.includes(record.requestId)) return;
  const session = dialogSession;
  queryingTests.value = [...queryingTests.value, record.requestId];
  try {
    const result = await queryAiFeatureModelTest(record.requestId);
    if (session !== dialogSession || !visible.value) return;
    const stored = storeModelTest(result);
    const cleared = await refreshRetiredModelOptions([stored], session);
    if (session !== dialogSession || !visible.value) return;
    const current =
      cleared ||
      (result.requestId === latestTestRequestId.value &&
        selectionKey(result) === selectionKey(currentTestSelection()));
    if (current) {
      modelTestHint.value = `${testLabels[stored.status]}：${stored.message}`;
      scheduleModelTestPoll(stored);
    }
    if (
      explicit ||
      (current &&
        stored.status !== record.status &&
        !["running", "accepted"].includes(stored.status))
    )
      notifyModelTest(stored);
  } catch (error) {
    if (session !== dialogSession || !visible.value) return;
    const result: AiFeatureModelTestResult = {
      ...record,
      status: "unknown",
      message: modelTestError(error),
      checkedAt: new Date().toISOString(),
    };
    const stored = storeModelTest(result, true);
    if (record.requestId === latestTestRequestId.value) {
      stopModelTestPoll();
      modelTestHint.value = stored.message;
    }
    if (
      !(isAxiosError(error) && error.response?.status === 401) &&
      stored === result
    )
      notifyModelTest(stored);
  } finally {
    if (session === dialogSession)
      queryingTests.value = queryingTests.value.filter(
        (id) => id !== record.requestId,
      );
  }
}
async function loadRecentModelTests(session = dialogSession) {
  recentTestsError.value = "";
  try {
    const records = await listAiFeatureModelTests();
    if (session !== dialogSession || !visible.value) return;
    for (const record of records) storeModelTest(record, false, false);
    if (formReadyForModelValidation.value)
      await refreshRetiredModelOptions(records, session);
  } catch (error) {
    if (session === dialogSession)
      recentTestsError.value = modelTestError(error);
  }
}
function queueModelTest(immediate = false) {
  if (
    !visible.value ||
    !formReadyForModelValidation.value ||
    !form.providerId ||
    !form.model ||
    submitting.value
  )
    return;
  const selection = currentTestSelection();
  const active = modelTestQueue.activeValueFor(selectionKey(selection));
  if (active) {
    modelTestQueue.schedule(active, selectionKey(selection), immediate);
    latestTestRequestId.value = active.requestId;
    modelTestHint.value = `正在实际测试“${selection.model}”，未重复提交。`;
    return;
  }
  const previous = modelTests.value.find(
    (item) =>
      selectionKey(item) === selectionKey(selection) &&
      ["running", "accepted", "unknown"].includes(item.status),
  );
  if (previous && !immediate) {
    latestTestRequestId.value = previous.requestId;
    modelTestHint.value = `保留原测试：${previous.message}；本次切换未重新提交。`;
    if (["running", "accepted"].includes(previous.status))
      scheduleModelTestPoll(previous);
    else notifyModelTest(previous);
    return;
  }
  if (previous && ["running", "accepted"].includes(previous.status)) {
    latestTestRequestId.value = previous.requestId;
    void queryModelTest(previous);
    return;
  }
  const job = modelTestQueue.schedule(
    { selection, requestId: crypto.randomUUID(), startedAt: 0, sent: false },
    selectionKey(selection),
    immediate,
  );
  latestTestRequestId.value = job.requestId;
  if (testQueued.value)
    modelTestHint.value = testSubmissionBusy.value
      ? "已排队，前次提交结束后只测试最后选择的模型。"
      : "即将实际测试当前选择的模型…";
}

type AiFeatureConfigEditForm = AiFeatureConfigForm & {
  thinkingParametersText: string;
};

const form = reactive<AiFeatureConfigEditForm>({
  name: "",
  featureType: "chat",
  providerId: "",
  model: "",
  enableThinking: false,
  thinkingParameters: null,
  thinkingParametersText: "",
  useMineru: false,
  mineruConfigId: "",
  systemPrompt: "",
  temperature: 0.2,
  responseFormat: "text",
  supportsImageToImage: false,
  supportsImageToVideo: false,
  isEnabled: true,
  description: "",
});

const featureTypeOptions = [
  { label: "聊天", value: "chat" },
  { label: "内容创作", value: "contentCreation" },
  { label: "热点发现与推荐", value: "topicDiscovery" },
  { label: "提示词总结", value: "visualPrompt" },
  { label: "图片生成", value: "imageGeneration" },
  { label: "视频生成", value: "videoGeneration" },
  { label: "文档解析", value: "documentParse" },
  { label: "OCR", value: "ocr" },
  { label: "LLM 重排", value: "rerank" },
];

const providerOptions = computed(() =>
  providers.value.map((item) => ({
    label: item.name,
    value: item.id,
  })),
);

const mineruConfigOptions = computed(() =>
  mineruConfigs.value.map((item) => ({
    label: item.name,
    value: item.id,
  })),
);

const selectedProvider = computed(() =>
  providers.value.find((item) => item.id === Number(form.providerId)),
);

const isParseFeature = computed(() =>
  ["ocr", "documentParse"].includes(form.featureType),
);
const isOcrFeature = computed(() => form.featureType === "ocr");
const isMineruOcrFeature = computed(
  () => isOcrFeature.value && !!form.useMineru,
);
const isWritingFeature = computed(() => form.featureType === "contentCreation");
const isTopicFeature = computed(() => form.featureType === "topicDiscovery");
const isVisualPromptFeature = computed(
  () => form.featureType === "visualPrompt",
);
const isImageGenerationFeature = computed(
  () => form.featureType === "imageGeneration",
);
const isVideoGenerationFeature = computed(
  () => form.featureType === "videoGeneration",
);
const isMediaGenerationFeature = computed(
  () => isImageGenerationFeature.value || isVideoGenerationFeature.value,
);
const isTextFeature = computed(() =>
  ["chat", "contentCreation"].includes(form.featureType),
);
const isRerankFeature = computed(() => form.featureType === "rerank");
const isStructuredParseFeature = computed(() => isParseFeature.value);
const isMarkdownFeature = computed(() => isParseFeature.value);
const usesTemperature = computed(
  () => !isRerankFeature.value && !isMediaGenerationFeature.value,
);
const usesPromptSettings = computed(() => !isRerankFeature.value);

const modelOptions = computed(() =>
  getModelOptions(
    selectedProvider.value,
    isMineruOcrFeature.value ? "documentParse" : form.featureType,
  ),
);

const modelPlaceholder = computed(() => {
  if (isMineruOcrFeature.value) return "请选择用于整理的文本模型";
  if (isImageGenerationFeature.value) return "请选择生图模型";
  if (isVideoGenerationFeature.value) return "请选择视频生成模型";
  if (form.featureType === "ocr") return "请选择视觉模型";
  if (form.featureType === "rerank") return "请选择用于重排的通用文本模型";
  return "请选择模型";
});

const fields = computed<FormField[]>(() => {
  const baseFields: FormField[] = [
    {
      prop: "name",
      label: "配置名称",
      type: "input",
      placeholder: "如 聊天默认配置",
    },
    {
      prop: "featureType",
      label: "功能类型",
      type: "select",
      options: featureTypeOptions,
      hint:
        form.featureType === "chat"
          ? "当前为聊天：所选模型负责生成对话与知识库问答的最终回复。"
          : form.featureType === "topicDiscovery"
            ? "分析热点并按个人偏好推荐；采集及联网补充由系统按来源自动安排，不调用 Agent。"
            : form.featureType === "contentCreation"
              ? "用于文章后台生成；可启用多个配置，生成时选择使用哪一个。"
              : form.featureType === "visualPrompt"
                ? "用于从工作流原始提示词提炼格式、风格和模型规则，并按具体模型生成正向、负向提示词；固定返回 JSON，不调用 Agent。"
                : form.featureType === "imageGeneration"
                  ? "用于素材管理直接生成图片；使用账号的生图目录，并按模型和功能场景自动读取厂商接口卡片。"
                  : form.featureType === "videoGeneration"
                    ? "用于素材管理异步生成视频；按账号平台、模型和功能场景读取厂商接口卡片。"
                    : form.featureType === "rerank"
                      ? "当前为 LLM 重排：模型只给召回的知识片段评分和排序，不参与最终回答。"
                      : form.featureType === "ocr"
                        ? "当前为 OCR：仅处理图片或 PDF，可使用视觉模型或 MinerU 引擎。"
                        : "当前为文档解析：仅处理文本/TXT/Word，由大模型按提示词整理为结构化 Markdown。",
    },
  ];

  if (isOcrFeature.value) {
    baseFields.push({
      prop: "useMineru",
      label: "OCR 引擎",
      component: "Switch",
      componentProps: {
        activeText: "MinerU 引擎",
        inactiveText: "视觉模型",
      },
      hint: form.useMineru
        ? "先由 MinerU 识别，再由下方大模型按提示词整理为 Markdown 后入库。"
        : "当前使用视觉模型：适合图片/PDF 识别，可通过提示词约束 Markdown 结构。",
    });
  }

  if (isMineruOcrFeature.value) {
    baseFields.push({
      prop: "mineruConfigId",
      label: "MinerU引擎",
      type: "select",
      options: mineruConfigOptions,
      placeholder: "请选择 MinerU引擎",
    });
  }

  {
    baseFields.push(
      {
        prop: "providerId",
        label: isMineruOcrFeature.value ? "整理模型账号" : "大模型账号",
        type: "select",
        options: providerOptions,
      },
      {
        prop: "model",
        label: isMineruOcrFeature.value ? "整理模型" : "模型",
        type: "select",
        options: modelOptions,
        placeholder: modelPlaceholder.value,
        hint: validatingModel.value
          ? `正在匹配“${form.model}”的功能接口…`
          : modelTestHint.value ||
            modelValidationHint.value ||
            (isTopicFeature.value
              ? "切换模型时测试普通文本调用，用于热点分析与推荐；不自动测试联网搜索。"
              : isMediaGenerationFeature.value
                ? "切换模型会直接生成测试内容，可能计费；不会保存为业务素材。"
                : isRerankFeature.value
                  ? "请选择通用文本模型。系统会固定用温度 0 和内置 JSON 评分提示词调用它，不会生成最终回答。"
                  : "切换模型后匹配厂商接口并直接测试，可能产生费用。"),
      },
    );
    if (usesTemperature.value) {
      baseFields.push({
        prop: "temperature",
        label: "温度",
        component: "InputNumber",
        componentProps: { min: 0, max: 2, precision: 2, step: 0.1 },
        hint:
          Number(form.temperature) <= 0.2
            ? `当前 ${form.temperature}：输出更稳定、可复现，适合客服、解析和结构化结果。`
            : Number(form.temperature) <= 0.8
              ? `当前 ${form.temperature}：稳定性与表达多样性较均衡，适合常规对话。`
              : `当前 ${form.temperature}：表达更发散、随机性更强，可能降低格式与事实的一致性。`,
      });
    }
  }

  if (isTextFeature.value) {
    baseFields.push({
      prop: "enableThinking",
      label: "Think 模式",
      component: "Switch",
      componentProps: { activeText: "开启", inactiveText: "关闭" },
      hint: form.enableThinking
        ? "当前开启：推理模型会先进行内部思考，复杂任务通常更稳，但响应更慢、成本更高。"
        : "当前关闭：直接生成回复，延迟与消耗更低。",
    });
    if (form.enableThinking) {
      baseFields.push({
        prop: "thinkingParametersText",
        label: "Think 参数",
        type: "textarea",
        rows: 5,
        placeholder:
          'JSON 对象。例如 Qwen：{\n  "enable_thinking": true\n}\n或推理模型：{\n  "reasoning_effort": "medium"\n}',
      });
    }
  }

  if (usesPromptSettings.value) {
    baseFields.push({
      prop: "systemPrompt",
      label: isMediaGenerationFeature.value
        ? "默认画面要求"
        : isVisualPromptFeature.value
          ? "提炼偏好"
          : isMineruOcrFeature.value
            ? "整理提示词"
            : "提示词",
      type: "textarea",
      rows: 5,
      placeholder: isMediaGenerationFeature.value
        ? "如：主体清晰、构图简洁、无文字、无水印"
        : isVisualPromptFeature.value
          ? "可补充默认语言、标签顺序或希望保留的模型专用语法；系统仍固定输出正向/负向 JSON 结构"
          : isStructuredParseFeature.value
            ? "可补充业务术语、标题规则或保留项；系统会固定追加 Markdown 结构化输出要求"
            : isWritingFeature.value
              ? "填写默认写作口吻或偏好；模板决定文章结构，正文格式以所选格式为准"
              : "该功能默认系统提示词，可被测试请求临时覆盖",
      hint: (() => {
        const prompt = form.systemPrompt?.trim() ?? "";
        if (isMediaGenerationFeature.value)
          return prompt
            ? `生成素材时会把这 ${prompt.length} 个字符作为固定画面要求拼接到用户提示词。`
            : "可留空；系统仍会拼接所选风格，不额外调用文本模型润色。";
        if (isStructuredParseFeature.value) {
          return prompt
            ? `当前已填写 ${prompt.length} 个字符；系统会在其后固定追加 Markdown、标题层级、列表与表格保留规则。`
            : "系统会固定要求 Markdown 输出；此处仅补充业务术语、标题规则或必须保留的内容。";
        }
        return prompt
          ? `当前已填写 ${prompt.length} 个字符；业务规则、口吻和禁止项请直接写在此提示词中。`
          : isWritingFeature.value
            ? "默认按素材和观点直接成稿，不设置新闻素材审核门槛；身份与口吻可自定义。不会自动检索新闻或读取链接。"
            : "未填写时将使用系统默认提示词；业务规则、口吻和禁止项请直接写在此处。";
      })(),
    });
    if (!isMediaGenerationFeature.value) {
      baseFields.push({
        prop: "responseFormat",
        label: isWritingFeature.value ? "正文格式" : "返回格式",
        type: "select",
        options:
          isVisualPromptFeature.value || isTopicFeature.value
            ? [{ label: "JSON（固定）", value: "json" }]
            : isMarkdownFeature.value
              ? [{ label: "Markdown（固定）", value: "markdown" }]
              : isWritingFeature.value
                ? [
                    { label: "纯文本", value: "text" },
                    { label: "Markdown", value: "markdown" },
                  ]
                : [
                    { label: "文本", value: "text" },
                    { label: "JSON", value: "json" },
                    { label: "Markdown", value: "markdown" },
                  ],
        componentProps:
          isMarkdownFeature.value ||
          isVisualPromptFeature.value ||
          isTopicFeature.value
            ? { disabled: true }
            : undefined,
        hint: isWritingFeature.value
          ? "仅控制文章正文格式，优先于模板中的格式描述；编辑提示单独展示。纯文本适合复制到发布平台。"
          : isStructuredParseFeature.value
            ? "文档解析固定输出 Markdown，以保留标题、列表、表格等结构并支持章节分片。"
            : form.responseFormat === "json"
              ? "当前要求 JSON：适合被程序解析，提示词中应明确字段结构并避免附加说明。"
              : form.responseFormat === "markdown"
                ? "当前要求 Markdown：适合保留标题、列表、表格等富文本结构。"
                : "当前返回普通文本：兼容性最好，适合一般对话和简短结果。",
      });
    }
  }

  if (isImageGenerationFeature.value) {
    baseFields.push({
      prop: "supportsImageToImage",
      label: "图生图能力",
      component: "Switch",
      componentProps: { activeText: "支持", inactiveText: "不支持" },
      hint: form.supportsImageToImage
        ? "素材任务可上传参考图，并按该模型的“参考生图”接口卡片执行；缺少卡片时明确提示。"
        : "素材任务仅允许文生图，不显示为可用的图生图配置。",
    });
  }

  if (isVideoGenerationFeature.value) {
    baseFields.push({
      prop: "supportsImageToVideo",
      label: "参考素材生视频",
      component: "Switch",
      componentProps: { activeText: "支持", inactiveText: "不支持" },
      hint: form.supportsImageToVideo
        ? "素材任务可使用首帧图片或多张图片/视频参考素材；文生视频始终可用。"
        : "素材任务仅允许文生视频，不显示为可用的参考素材视频配置。",
    });
  }

  return [
    ...baseFields,
    {
      prop: "isEnabled",
      label: "是否启用",
      component: "Switch",
      componentProps: { activeText: "启用", inactiveText: "停用" },
    },
    { prop: "description", label: "描述", type: "textarea", rows: 3 },
  ];
});

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: "请输入配置名称", trigger: "blur" }],
  featureType: [
    { required: true, message: "请选择功能类型", trigger: "change" },
  ],
  ...(isMineruOcrFeature.value
    ? {
        mineruConfigId: [
          {
            required: true,
            message: "请选择 MinerU引擎",
            trigger: ["change", "blur"],
          },
        ],
      }
    : {}),
  ...{
    providerId: [
      { required: true, message: "请选择大模型账号", trigger: "change" },
    ],
    model: [{ required: true, message: "请选择模型", trigger: "change" }],
  },
  ...(usesTemperature.value
    ? {
        temperature: [
          { required: true, message: "请输入温度", trigger: "blur" },
        ],
      }
    : {}),
}));

watch(
  visible,
  async (value) => {
    const session = ++dialogSession;
    retiredOptionsSequence += 1;
    appliedModelRemovals.clear();
    modelValidationSequence += 1;
    formReadyForModelValidation.value = false;
    validatingModel.value = false;
    modelValidationHint.value = "";
    checkedEndpoint.value = null;
    modelTestQueue.close();
    stopModelTestPoll();
    latestTestRequestId.value = "";
    modelTestHint.value = "";
    queryingTests.value = [];
    loading.value = false;
    if (!value) return;
    modelTestQueue.open();
    modelTests.value = [];
    modelTestHistory.clear();
    const recentTestsPromise = loadRecentModelTests(session);
    loading.value = true;
    let initialized = false;
    try {
      const rowId = props.row?.id;
      const [options, detail] = await Promise.all([
        getThirdPartyOptions(),
        rowId ? getAiFeatureConfig(rowId) : Promise.resolve(null),
      ]);
      if (session !== dialogSession || !visible.value) return;
      providers.value = options.providers;
      mineruConfigs.value = options.mineruConfigs;
      if (detail) fillForm(detail);
      else resetForm();
      initialized = true;
    } finally {
      // 先恢复已提交任务，避免初始化结束后选择模型时重复提交旧的异步测试。
      await recentTestsPromise;
      if (session === dialogSession && visible.value)
        await refreshRetiredModelOptions(modelTests.value, session);
      await nextTick();
      if (session === dialogSession && visible.value) {
        loading.value = false;
        if (recentTestsError.value) {
          modelTestHint.value =
            "最近测试记录读取失败，可在下方重新读取；切换模型仍会直接发起真实测试。";
        }
        formReadyForModelValidation.value = initialized;
        if (initialized && form.providerId && form.model)
          void validateSelectedModel();
      }
    }
  },
  { flush: "sync" },
);

onBeforeUnmount(() => {
  dialogSession += 1;
  retiredOptionsSequence += 1;
  modelValidationSequence += 1;
  modelTestQueue.close();
  stopModelTestPoll();
});

watch(
  () => form.featureType,
  (type, previousType) => {
    // 用户切换为内容创作时默认纯文本；编辑回显保留已有格式。
    if (type === "contentCreation" && formReadyForModelValidation.value)
      form.responseFormat = "text";
    if (!formReadyForModelValidation.value) return;
    if (type === "imageGeneration" && previousType !== "imageGeneration")
      form.supportsImageToImage = true;
    if (type === "videoGeneration" && previousType !== "videoGeneration")
      form.supportsImageToVideo = true;
    if (type !== "imageGeneration") form.supportsImageToImage = false;
    if (type !== "videoGeneration") form.supportsImageToVideo = false;
  },
);

watch(
  () => [
    form.featureType,
    form.providerId,
    form.useMineru,
    providers.value.length,
  ],
  () => {
    if (!isOcrFeature.value) {
      form.useMineru = false;
      form.mineruConfigId = "";
    }
    if (!isTextFeature.value) {
      form.enableThinking = false;
      form.thinkingParametersText = "";
    }
    if (isRerankFeature.value) {
      form.systemPrompt = "";
      form.temperature = 0;
      form.responseFormat = "json";
    }
    if (isVisualPromptFeature.value || isTopicFeature.value) {
      form.enableThinking = false;
      form.thinkingParametersText = "";
      form.useMineru = false;
      form.responseFormat = "json";
    }
    if (isMediaGenerationFeature.value) {
      form.temperature = 0;
      form.responseFormat = "text";
    }
    if (isMarkdownFeature.value) {
      form.responseFormat = "markdown";
    }
    if (!isMineruOcrFeature.value) form.mineruConfigId = "";
    const options = modelOptions.value;
    if (
      selectedProvider.value &&
      !options.some((item) => item.value === form.model)
    ) {
      form.model = "";
    }
  },
);

watch(
  () =>
    [form.model, form.providerId, form.featureType, form.useMineru] as const,
  () => {
    const sequence = ++modelValidationSequence;
    retiredOptionsSequence += 1;
    modelTestQueue.cancelPending();
    stopModelTestPoll();
    latestTestRequestId.value = "";
    modelTestHint.value = "";
    validatingModel.value = false;
    modelValidationHint.value = "";
    checkedEndpoint.value = null;
    if (
      !visible.value ||
      !formReadyForModelValidation.value ||
      !form.providerId ||
      !form.model
    ) {
      return;
    }
    // 先等功能切换引起的模型目录和表单归一化完成，再检查最终选择。
    void nextTick(() => {
      if (sequence === modelValidationSequence) queueModelTest();
    });
  },
  { flush: "sync" },
);

function resetForm() {
  form.name = "";
  form.featureType = "chat";
  form.providerId = "";
  form.model = "";
  form.enableThinking = false;
  form.thinkingParametersText = "";
  form.useMineru = false;
  form.mineruConfigId = "";
  form.systemPrompt = "";
  form.temperature = 0.2;
  form.responseFormat = "text";
  form.supportsImageToImage = false;
  form.supportsImageToVideo = false;
  form.isEnabled = true;
  form.description = "";
}

function fillForm(data: AiFeatureConfig) {
  form.name = data.name ?? "";
  form.featureType = data.featureType;
  form.providerId = data.providerId ?? "";
  form.model = data.model ?? "";
  form.enableThinking = !!data.enableThinking;
  form.thinkingParametersText = data.thinkingParameters
    ? JSON.stringify(data.thinkingParameters, null, 2)
    : "";
  form.useMineru = !!data.useMineru;
  form.mineruConfigId = data.mineruConfigId ?? "";
  form.systemPrompt = data.systemPrompt ?? "";
  form.temperature = Number(data.temperature ?? 0.2);
  form.responseFormat = data.responseFormat ?? "text";
  form.supportsImageToImage = !!data.supportsImageToImage;
  form.supportsImageToVideo = !!data.supportsImageToVideo;
  form.isEnabled = !!data.isEnabled;
  form.description = data.description ?? "";
}

function buildPayload(): AiFeatureConfigForm {
  return {
    name: form.name.trim(),
    featureType: form.featureType,
    providerId: Number(form.providerId),
    model: form.model?.trim(),
    enableThinking: isTextFeature.value && !!form.enableThinking,
    thinkingParameters: resolveThinkingParameters(),
    useMineru: isMineruOcrFeature.value,
    mineruConfigId: isMineruOcrFeature.value
      ? Number(form.mineruConfigId)
      : null,
    systemPrompt: isRerankFeature.value ? "" : form.systemPrompt?.trim(),
    temperature:
      isRerankFeature.value || isMediaGenerationFeature.value
        ? 0
        : Number(form.temperature),
    responseFormat:
      isRerankFeature.value ||
      isVisualPromptFeature.value ||
      isTopicFeature.value
        ? "json"
        : isMediaGenerationFeature.value
          ? "text"
          : isMarkdownFeature.value
            ? "markdown"
            : form.responseFormat,
    supportsImageToImage:
      isImageGenerationFeature.value && !!form.supportsImageToImage,
    supportsImageToVideo:
      isVideoGenerationFeature.value && !!form.supportsImageToVideo,
    isEnabled: form.isEnabled,
    description: form.description?.trim(),
  };
}

function resolveThinkingParameters() {
  if (!isTextFeature.value || !form.enableThinking) return null;
  const text = form.thinkingParametersText.trim();
  if (!text) {
    throw new Error("启用 Think 模式时，请填写 Think 参数 JSON 对象");
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(
        'Think 参数必须是 JSON 对象，例如 {"enable_thinking":true}',
      );
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Think 参数不是合法的 JSON 对象");
    }
    throw error;
  }
}

async function handleSubmit() {
  if (loading.value || submitting.value) return;
  // 保存只检查配置，取消尚未发出的自动测试；已提交请求不重复发送。
  modelTestQueue.cancelPending();
  stopModelTestPoll();
  await formRef.value?.validate();
  let payload: AiFeatureConfigForm;
  try {
    payload = buildPayload();
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : "Think 参数配置不正确",
    );
    return;
  }
  submitting.value = true;
  try {
    if (!(await validateSelectedModel())) {
      if (visible.value)
        ElMessage.warning(
          modelValidationHint.value ||
            "模型选择已变化，请确认接口匹配结果后保存",
        );
      return;
    }
    if (props.row?.id) {
      await updateAiFeatureConfig(props.row.id, payload);
      ElMessage.success("更新成功");
    } else {
      await createAiFeatureConfig(payload);
      ElMessage.success("创建成功");
    }
    visible.value = false;
    emit("success");
  } finally {
    submitting.value = false;
  }
}

function getModelText(
  provider: ProviderOption | undefined,
  featureType: AiFeatureType,
) {
  if (!provider) return "";
  if (
    featureType === "chat" ||
    featureType === "contentCreation" ||
    featureType === "topicDiscovery" ||
    featureType === "visualPrompt" ||
    featureType === "documentParse" ||
    featureType === "rerank"
  ) {
    return joinModelTexts(provider.models, provider.textModels);
  }
  if (featureType === "ocr") {
    return joinModelTexts(provider.visionModels, provider.models);
  }
  if (featureType === "imageGeneration") {
    return provider.imageGenerationModels || "";
  }
  if (featureType === "videoGeneration") {
    return provider.videoGenerationModels || "";
  }
  return "";
}

async function validateSelectedModel() {
  const providerId = Number(form.providerId);
  const model = form.model?.trim() ?? "";
  if (
    !visible.value ||
    !formReadyForModelValidation.value ||
    !providerId ||
    !model
  )
    return false;
  const requestSequence = ++modelValidationSequence;
  validatingModel.value = true;
  modelValidationHint.value = "";
  try {
    const result = await checkAiFeatureModelEndpoint({
      providerId,
      model,
      featureType: form.featureType,
      useMineru: isMineruOcrFeature.value,
    });
    if (requestSequence !== modelValidationSequence) return false;
    checkedEndpoint.value = result;
    const source =
      result.source === "standard"
        ? "使用自定义平台标准接口"
        : `已匹配「${result.ruleName}」`;
    modelValidationHint.value = `${source}（${result.functionLabel}）：${result.apiPath}。仅检查配置，未调用模型。`;
    return true;
  } catch (error) {
    if (requestSequence === modelValidationSequence) {
      const message: unknown = isAxiosError(error)
        ? error.response?.data?.message
        : error instanceof Error
          ? error.message
          : null;
      modelValidationHint.value =
        typeof message === "string" ? message : "接口配置检查失败，请重试。";
    }
    return false;
  } finally {
    if (requestSequence === modelValidationSequence) {
      validatingModel.value = false;
    }
  }
}

function getModelOptions(
  provider: ProviderOption | undefined,
  featureType: AiFeatureType,
) {
  const seen = new Set<string>();
  return parseModelText(getModelText(provider, featureType))
    .filter((item) => {
      if (seen.has(item.code)) return false;
      seen.add(item.code);
      return true;
    })
    .map((item) => ({
      label:
        item.name === item.code ? item.code : `${item.name} (${item.code})`,
      value: item.code,
    }));
}

function parseModelText(value: string) {
  return (value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [code, name] = line.split("#");
      const modelCode = code.trim();
      return {
        code: modelCode,
        name: (name || modelCode).trim(),
      };
    })
    .filter((item) => item.code);
}

function joinModelTexts(...values: Array<string | null | undefined>) {
  // 账号的“模型列表”是通用池，功能模型是补充/精简池；这里合并后由 getModelOptions 去重。
  return values
    .map((item) => item?.trim())
    .filter(Boolean)
    .join("\n");
}
</script>

<template>
  <Dialog
    v-model="visible"
    :title="props.row ? '编辑 AI 功能配置' : '新增 AI 功能配置'"
    width="860px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <el-alert
        class="ai-feature-config-edit__test-notice"
        title="切换账号、模型或功能会直接真实调用，可能计费；图片/视频会生成测试内容。打开、回显和保存不发起实际测试。关闭窗口不取消已提交的供应商任务。"
        type="warning"
        :closable="false"
      />
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="110px"
      />
      <el-collapse
        v-if="modelTests.length || modelTestHint || recentTestsError"
        class="ai-feature-config-edit__tests"
      >
        <el-collapse-item
          :title="`最近真实测试（${modelTests.length}）`"
          name="recent-model-tests"
        >
          <el-alert
            v-if="recentTestsError"
            :title="recentTestsError"
            type="warning"
            :closable="false"
          />
          <div class="ai-feature-config-edit__test-controls">
            <Button
              perm="Menu.read"
              icon="Connection"
              :confirm="false"
              :loading="testSubmissionBusy"
              :disabled="
                loading ||
                submitting ||
                testSubmissionBusy ||
                !formReadyForModelValidation ||
                !form.providerId ||
                !form.model
              "
              @click="queueModelTest(true)"
              >重新测试（可能计费）</Button
            >
            <Button
              v-if="recentTestsError"
              perm="Menu.read"
              :confirm="false"
              @click="loadRecentModelTests()"
              >重新读取记录</Button
            >
          </div>
          <article
            v-for="record in modelTests"
            :key="record.requestId"
            class="ai-feature-config-edit__test-record"
          >
            <div class="ai-feature-config-edit__test-heading">
              <strong>{{ record.model }}</strong>
              <el-tag
                :type="
                  getPermissionActionColor(
                    record.status === 'succeeded'
                      ? 'create'
                      : record.status === 'failed'
                        ? 'delete'
                        : 'read',
                  )
                "
                >{{ testLabels[record.status] }}</el-tag
              >
              <Button
                v-if="!['succeeded', 'failed'].includes(record.status)"
                perm="Menu.read"
                link
                :confirm="false"
                :loading="queryingTests.includes(record.requestId)"
                @click="queryModelTest(record)"
                >查询原测试</Button
              >
            </div>
            <p>{{ record.message }}</p>
            <div>
              {{ record.functionLabel || record.featureType || "模型测试" }} ·
              账号：{{
                providers.find((item) => item.id === record.providerId)?.name ||
                record.providerId ||
                "未记录"
              }}
            </div>
            <div v-if="record.ruleName">{{ record.ruleName }}</div>
            <div>
              HTTP：{{ record.httpStatus ?? "暂无响应" }} · 耗时：{{
                (record.elapsedMilliseconds / 1000).toFixed(2)
              }}
              秒 · {{ new Date(record.checkedAt).toLocaleString() }}
            </div>
            <div v-if="record.taskId">供应商任务：{{ record.taskId }}</div>
            <div>测试编号：{{ record.requestId }}</div>
          </article>
          <p class="ai-feature-config-edit__test-retention">
            记录仅供本次账号和模型测试核实，服务端最多保留 30
            分钟，重启后清空；结果不确定时先查询原测试，避免重复生成。
          </p>
        </el-collapse-item>
      </el-collapse>
      <div v-if="isRerankFeature" class="ai-feature-config-edit__rerank-tip">
        LLM 重排固定以温度 0 和 JSON 评分格式执行，系统会把“用户问题 +
        初步召回片段”交给所选模型重新排序；聊天提示词、Think
        和返回格式均不适用于此类型。
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.ai-feature-config-edit__test-notice {
  margin-bottom: 16px;
}
.ai-feature-config-edit__test-controls,
.ai-feature-config-edit__test-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.ai-feature-config-edit__tests {
  margin-top: 16px;
}
.ai-feature-config-edit__test-record {
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.ai-feature-config-edit__test-record p {
  margin: 6px 0;
}
.ai-feature-config-edit__test-retention {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.ai-feature-config-edit__rerank-tip {
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}
</style>
