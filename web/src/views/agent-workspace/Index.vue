<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import PageContainer from "@/components/PageContainer.vue";
import Button from "@/components/Button.vue";
import Input from "@/components/Input.vue";
import Select from "@/components/Select.vue";
import UploadImage from "@/components/UploadImage.vue";
import { useUserStore } from "@/stores/user";
import { formatDateTime } from "@/utils/format";
import { getPermissionActionColor } from "@/utils/permission";
import { getProductOptions, type ProductOption } from "@/api/productCatalog";
import {
  cancelAgentPendingAction,
  confirmAgentPendingAction,
  createAgentSession,
  getAgentExecutionByRequest,
  getAgentExecutionProgress,
  getAgentSession,
  getAgentSessionMessages,
  getAgentSessions,
  getAvailableAgentApps,
  sendAgentMessage,
  stopAgentExecution,
  updateAgentPendingAction,
  uploadAgentImage,
  type AgentImageReference,
  type AgentPendingAction,
  type AgentExecutionProgress,
  type AgentMessage,
  type AgentSession,
  type AgentSessionDetail,
  type AvailableAgentApp,
} from "@/api/agentWorkspace";
import AgentMessageList from "./components/AgentMessageList.vue";
import AgentDebugPanel from "./components/AgentDebugPanel.vue";
import { agentProgressText, createAgentProgressPoller } from "./agentProgress";
import { clipboardImages, imageUploadError } from "./agentClipboard";

interface AgentPromptSuggestion {
  kind: "chat" | "query" | "write";
  title: string;
  description: string;
  prompt: string;
}

type PendingMessageStatus = "queued" | "sending" | "failed";

interface PendingAgentMessage {
  image?: AgentImageReference;
  textModel?: string;
  id: number;
  sessionId: number;
  content: string;
  clientMessageId: string;
  requestId: string;
  status: PendingMessageStatus;
  errorMessage?: string;
  createdAt: string;
}

const AUTO_TEXT_MODEL = "__agent_auto__";
const props = withDefaults(defineProps<{ debug?: boolean }>(), {
  debug: false,
});

const userStore = useUserStore();
const apps = ref<AvailableAgentApp[]>([]);
const selectedAgentId = ref<string | null>(null);
const selectedTextModel = ref(AUTO_TEXT_MODEL);
const sessions = ref<AgentSession[]>([]);
const activeSession = ref<AgentSessionDetail | null>(null);
const products = ref<ProductOption[]>([]);
const sessionKeyword = ref("");
const inputText = ref("");
const showImagePicker = ref(false);
const uploadBusy = ref(false);
const attachedImage = ref<AgentImageReference | null>(null);
const imagePreview = ref<string | null>("");
let previewObjectUrl = "";
const loadingSessions = ref(false);
const loadingDetail = ref(false);
const loadingOlderMessages = ref(false);
const switchingAgent = ref(false);
const debugRevision = ref(0);
const debugBusy = computed(
  () => props.debug && (switchingAgent.value || loadingDetail.value),
);
const sending = ref(false);
const actionBusy = ref(false);
const isComposing = ref(false);
const activeRequestId = ref("");
const pendingMessages = ref<PendingAgentMessage[]>([]);
const executionProgress = ref<AgentExecutionProgress | null>(null);
const progressUnavailable = ref(false);
const processingStartedAt = ref("");
let disposed = false;
const progressPoller = createAgentProgressPoller({
  fetchProgress: getAgentExecutionProgress,
  onProgress(progress) {
    executionProgress.value = progress;
    progressUnavailable.value = false;
  },
  onUnavailable() {
    progressUnavailable.value = true;
  },
});
let requestVersion = 0;
let localMessageId = -1;
let queueProcessing = false;
let lastReadyAgentId = "";
const confirmationKeys = new Map<number, string>();

const currentApp = computed(() =>
  apps.value.find((item) => item.id === Number(selectedAgentId.value)),
);
const mediaHint = computed(() =>
  uploadBusy.value
    ? "正在上传图片…"
    : [
        currentApp.value?.mediaCapabilities?.vision
          ? "可直接粘贴一张图片（PNG / JPEG / WebP，≤ 5 MB）"
          : "",
        currentApp.value?.mediaCapabilities?.imageGeneration
          ? "描述生图需求即可生成，可能产生费用，不自动重试"
          : "",
      ]
        .filter(Boolean)
        .join("；"),
);
function clearImage() {
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = "";
  imagePreview.value = "";
  attachedImage.value = null;
  showImagePicker.value = false;
}
function resetMediaInput() {
  clearImage();
}
async function uploadImage(file: File) {
  const error = imageUploadError(file);
  if (error) {
    ElMessage.warning(error);
    throw new Error(error);
  }
  if (uploadBusy.value || actionBusy.value || debugBusy.value)
    throw new Error("请等待当前上传完成");
  if (!currentApp.value?.mediaCapabilities?.vision)
    throw new Error("当前 Agent 未配置图片识别模型");
  const sessionId =
    activeSession.value?.id ??
    (props.debug ? await ensureSession() : undefined);
  if (!sessionId) throw new Error("请先创建会话");
  uploadBusy.value = true;
  try {
    const image = await uploadAgentImage(sessionId, file);
    if (disposed || activeSession.value?.id !== sessionId)
      throw new Error("会话已切换，请重新上传图片");
    clearImage();
    attachedImage.value = image;
    previewObjectUrl = URL.createObjectURL(file);
    imagePreview.value = previewObjectUrl;
    return {
      url: previewObjectUrl,
      fileName: String(image.id),
      originalName: file.name,
      mimeType: image.mimeType,
      size: image.size,
    };
  } finally {
    uploadBusy.value = false;
  }
}
async function pasteImage(event: ClipboardEvent) {
  const images = clipboardImages(event.clipboardData);
  if (!images.length) return; // 普通文本粘贴保持原行为；混合图文也保留原生文字粘贴。
  if (!event.clipboardData?.getData("text/plain")) event.preventDefault();
  if (images.length > 1) {
    ElMessage.warning("每条消息支持一张图片，请逐张粘贴");
    return;
  }
  if (uploadBusy.value || actionBusy.value) {
    ElMessage.warning("请等待当前动作完成后再粘贴图片");
    return;
  }
  if (!currentApp.value?.mediaCapabilities?.vision) {
    ElMessage.warning("请先在 Agent 应用中配置当前账号的图片识别模型");
    return;
  }
  if (attachedImage.value) {
    ElMessage.warning("已有待发送图片，请先移除再粘贴，避免覆盖附件");
    return;
  }
  try {
    await uploadImage(images[0]!);
  } catch {
    /* 请求层已提示，保留文字且不自动发送。 */
  }
}
const agentOptions = computed(() =>
  apps.value.map((item) => ({ value: String(item.id), text: item.name })),
);
const textModelOptions = computed(() => [
  { value: AUTO_TEXT_MODEL, text: "Auto" },
  ...(currentApp.value?.models ?? []).map((model) => ({
    value: model,
    text: model,
  })),
]);
const currentAppInitial = computed(
  () => currentApp.value?.name.trim().slice(0, 1).toUpperCase() || "A",
);
const activePendingMessages = computed(() =>
  pendingMessages.value.filter(
    (item) => item.sessionId === activeSession.value?.id,
  ),
);
// 当前请求已在主对话中乐观展示；输入区只保留等待发送或需要重试的消息。
// 保留内部 sending 状态，避免把模型仍在处理误当成完成或提前释放串行队列。
const composerPendingMessages = computed(() =>
  activePendingMessages.value.filter((item) => item.status !== "sending"),
);
const hasPendingMessages = computed(() => pendingMessages.value.length > 0);
const processingMessage = computed(() => {
  const item = activePendingMessages.value.find(
    (message) =>
      message.status === "sending" &&
      message.requestId === activeRequestId.value,
  );
  if (!item || executionProgress.value?.status === "cancelled") return null;
  // 正式回答已同步时立即移除临时提示，不与完成消息并排出现。
  if (
    executionProgress.value &&
    activeSession.value?.messages.some(
      (message) =>
        message.role === "assistant" &&
        message.executionId === executionProgress.value?.executionId,
    )
  )
    return null;
  return {
    clientMessageId: item.clientMessageId,
    text: agentProgressText(executionProgress.value, progressUnavailable.value),
    startedAt: executionProgress.value?.startedAt || processingStartedAt.value,
  };
});
const visibleMessages = computed<AgentMessage[]>(() => {
  if (!activeSession.value) return [];
  const serverMessages = activeSession.value.messages;
  const persistedClientIds = new Set(
    serverMessages
      .map((item) => item.clientMessageId)
      .filter((item): item is string => Boolean(item)),
  );
  const optimisticMessages = activePendingMessages.value
    .filter((item) => !persistedClientIds.has(item.clientMessageId))
    .map<AgentMessage>((item) => ({
      id: item.id,
      sessionId: item.sessionId,
      userId: userStore.userInfo?.id ?? 0,
      role: "user",
      messageType: "text",
      content: item.content,
      structuredData: {
        ...(item.image ? { images: [item.image] } : {}),
      },
      executionId: null,
      clientMessageId: item.clientMessageId,
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
    }));
  return [...serverMessages, ...optimisticMessages];
});
const hasOlderMessages = computed(
  () =>
    Boolean(activeSession.value) &&
    activeSession.value!.messages.length < activeSession.value!.messageTotal,
);
const capabilityLabels = computed(() => {
  const result = [{ key: "model", label: "模型对话", active: false }];
  if (currentApp.value?.mediaCapabilities?.vision)
    result.push({ key: "vision", label: "图片识别", active: true });
  if (currentApp.value?.mediaCapabilities?.imageGeneration)
    result.push({ key: "imageGeneration", label: "图片生成", active: true });
  for (const tool of currentApp.value?.tools ?? []) {
    result.push({
      key: tool.commandKey,
      label: tool.name,
      active: tool.requireApproval,
    });
  }
  return result;
});
const promptSuggestions = computed<AgentPromptSuggestion[]>(() => {
  const name = currentApp.value?.name || "当前 Agent";
  const result: AgentPromptSuggestion[] = [
    {
      kind: "chat",
      title: "了解一下",
      description: `看看 ${name} 可以为你做什么`,
      prompt: "请介绍一下你可以帮我完成哪些工作。",
    },
  ];
  const queryTool = currentApp.value?.tools.find(
    (tool) => tool.action === "read",
  );
  const writeTool = currentApp.value?.tools.find(
    (tool) => tool.action === "create",
  );
  if (queryTool) {
    result.push({
      kind: "query",
      title: "查询业务数据",
      description: queryTool.name,
      prompt: `${queryTool.name}，请先展示第一页。`,
    });
  }
  if (writeTool) {
    result.push({
      kind: "write",
      title: "创建待确认操作",
      description: "整理信息，确认后再受控写入",
      prompt: `我想${writeTool.name}，请引导我补充所需信息。`,
    });
  }
  if (result.length < 2) {
    result.push({
      kind: "chat",
      title: "梳理问题",
      description: "把零散想法整理成清晰步骤",
      prompt: "我有一个问题需要梳理，请先告诉我应该提供哪些信息。",
    });
  }
  return result.slice(0, 4);
});

async function loadSessions() {
  if (props.debug || !selectedAgentId.value) {
    sessions.value = [];
    return;
  }
  loadingSessions.value = true;
  try {
    const result = await getAgentSessions({
      page: 1,
      pageSize: 100,
      agentAppId: Number(selectedAgentId.value),
      keyword: sessionKeyword.value.trim() || undefined,
    });
    sessions.value = result.list;
  } finally {
    loadingSessions.value = false;
  }
}

async function loadSession(id: number, silent = false) {
  const version = ++requestVersion;
  if (!silent) loadingDetail.value = true;
  try {
    const detail = await getAgentSession(id);
    if (version !== requestVersion) return;
    activeSession.value = detail;
  } finally {
    if (!silent && version === requestVersion) loadingDetail.value = false;
  }
}

async function loadOlderMessages() {
  const session = activeSession.value;
  const beforeId = session?.messages[0]?.id;
  if (
    !session ||
    !beforeId ||
    loadingOlderMessages.value ||
    !hasOlderMessages.value
  )
    return;
  loadingOlderMessages.value = true;
  try {
    const result = await getAgentSessionMessages(session.id, {
      beforeId,
      pageSize: 50,
    });
    if (activeSession.value?.id !== session.id) return;
    const knownIds = new Set(
      activeSession.value.messages.map((item) => item.id),
    );
    activeSession.value.messages = [
      ...result.list.filter((item) => !knownIds.has(item.id)),
      ...activeSession.value.messages,
    ];
    activeSession.value.messageTotal = result.total;
  } finally {
    loadingOlderMessages.value = false;
  }
}

async function newSession() {
  if (uploadBusy.value || debugBusy.value) return;
  resetMediaInput();
  if (!selectedAgentId.value) return;
  requestVersion += 1;
  if (props.debug) loadingDetail.value = true;
  try {
    const session = await createAgentSession({
      agentAppId: Number(selectedAgentId.value),
      ...(props.debug
        ? { title: `调试 · ${currentApp.value?.name || "Agent"}` }
        : {}),
    });
    if (disposed) return;
    await loadSessions();
    await loadSession(session.id);
  } finally {
    if (props.debug) loadingDetail.value = false;
  }
}

async function switchAgent() {
  const nextAgentId = selectedAgentId.value ?? "";
  if (!nextAgentId || nextAgentId === lastReadyAgentId) return;
  const previousAgentId = lastReadyAgentId;
  const previousSessions = sessions.value;
  const previousActiveSession = activeSession.value;
  const previousTextModel = selectedTextModel.value;
  switchingAgent.value = true;
  resetMediaInput();
  selectedTextModel.value = AUTO_TEXT_MODEL;
  requestVersion += 1;
  activeSession.value = null;
  sessions.value = [];
  sessionKeyword.value = "";
  try {
    if (props.debug) {
      inputText.value = "";
    } else {
      await loadSessions();
      if (sessions.value.length) await loadSession(sessions.value[0].id);
      else await newSession();
    }
    lastReadyAgentId = nextAgentId;
    ElMessage.success(`已切换至 ${currentApp.value?.name || "目标 Agent"}`);
  } catch {
    selectedAgentId.value = previousAgentId;
    sessions.value = previousSessions;
    activeSession.value = previousActiveSession;
    selectedTextModel.value = previousTextModel;
    requestVersion += 1;
    ElMessage.warning("Agent 切换未完成，已恢复原会话");
  } finally {
    switchingAgent.value = false;
  }
}

async function selectSession(session: AgentSession) {
  if (
    hasPendingMessages.value ||
    actionBusy.value ||
    uploadBusy.value ||
    switchingAgent.value
  ) {
    ElMessage.warning("请先处理待发送消息或等待当前动作完成");
    return;
  }
  resetMediaInput();
  await loadSession(session.id);
}

async function refreshDebugConfiguration() {
  if (
    !props.debug ||
    debugBusy.value ||
    hasPendingMessages.value ||
    actionBusy.value ||
    uploadBusy.value
  )
    return;
  switchingAgent.value = true;
  try {
    const availableApps = await getAvailableAgentApps();
    if (disposed) return;
    apps.value = availableApps;
    if (!currentApp.value) {
      selectedAgentId.value = apps.value.length
        ? String(apps.value[0].id)
        : null;
      lastReadyAgentId = selectedAgentId.value || "";
      activeSession.value = null;
      inputText.value = "";
      requestVersion += 1;
    }
    if (!currentApp.value?.models.includes(selectedTextModel.value)) {
      selectedTextModel.value = AUTO_TEXT_MODEL;
    }
    resetMediaInput();
    debugRevision.value += 1;
  } finally {
    switchingAgent.value = false;
  }
}

function makeKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function ensureSession() {
  if (activeSession.value) return activeSession.value.id;
  await newSession();
  const createdSession = activeSession.value as AgentSessionDetail | null;
  if (!createdSession) throw new Error("无法创建 Agent 会话");
  return createdSession.id;
}

async function send() {
  const image = attachedImage.value ?? undefined;
  const content =
    inputText.value.trim() || (image ? "请识别并描述这张图片的内容。" : "");
  if (
    !content ||
    actionBusy.value ||
    isComposing.value ||
    uploadBusy.value ||
    debugBusy.value
  )
    return;
  let sessionId: number;
  try {
    sessionId = await ensureSession();
  } catch {
    return;
  }
  const clientMessageId = makeKey();
  const requestId = `message:${sessionId}:${clientMessageId}`;
  const textModel =
    selectedTextModel.value === AUTO_TEXT_MODEL
      ? undefined
      : selectedTextModel.value;
  inputText.value = "";
  pendingMessages.value.push({
    id: localMessageId--,
    sessionId,
    content,
    image,
    textModel,
    clientMessageId,
    requestId,
    status: "queued",
    createdAt: new Date().toISOString(),
  });
  clearImage();
  void processMessageQueue();
}

async function processMessageQueue() {
  if (queueProcessing || disposed) return;
  queueProcessing = true;
  try {
    let item = pendingMessages.value.find(
      (message) => message.status === "queued",
    );
    while (item && !disposed) {
      item.status = "sending";
      item.errorMessage = undefined;
      sending.value = true;
      activeRequestId.value = item.requestId;
      executionProgress.value = null;
      progressUnavailable.value = false;
      processingStartedAt.value = new Date().toISOString();
      progressPoller.start(item.requestId);
      let accepted = false;
      try {
        const result = await sendAgentMessage(item.sessionId, {
          content: item.content,
          clientMessageId: item.clientMessageId,
          imageId: item.image?.id,
          textModel: item.textModel,
        });
        if (disposed) return;
        progressPoller.stop();
        progressUnavailable.value = false;
        executionProgress.value = {
          executionId: result.execution.id,
          requestId: result.execution.requestId,
          sessionId: result.execution.sessionId,
          status: result.execution.status,
          stage: null,
          startedAt: result.execution.startedAt,
        };
        accepted = true;
      } catch {
        if (disposed) return;
        try {
          await getAgentExecutionByRequest(item.requestId);
          accepted = true;
        } catch {
          item.status = "failed";
          item.errorMessage = "发送失败，请重试或取消";
          ElMessage.error("消息发送失败，已保留在待发送列表");
        }
      }
      progressPoller.stop();
      if (disposed) return;
      if (accepted) {
        try {
          if (activeSession.value?.id === item.sessionId) {
            await Promise.all([
              loadSession(item.sessionId, true),
              loadSessions(),
            ]);
          }
          pendingMessages.value = pendingMessages.value.filter(
            (message) => message.clientMessageId !== item?.clientMessageId,
          );
        } catch {
          item.status = "failed";
          item.errorMessage = "消息已提交，但会话刷新失败，可重试同步";
          ElMessage.warning("消息已提交，但会话刷新失败");
        }
      }
      sending.value = false;
      activeRequestId.value = "";
      item = pendingMessages.value.find(
        (message) => message.status === "queued",
      );
    }
  } finally {
    progressPoller.stop();
    executionProgress.value = null;
    sending.value = false;
    activeRequestId.value = "";
    queueProcessing = false;
  }
}

function sendPrompt(prompt: string) {
  if (actionBusy.value || uploadBusy.value) return;
  resetMediaInput();
  inputText.value = prompt;
  void send();
}

function cancelPendingMessage(clientMessageId: string) {
  const item = pendingMessages.value.find(
    (message) => message.clientMessageId === clientMessageId,
  );
  if (!item || item.status === "sending") return;
  pendingMessages.value = pendingMessages.value.filter(
    (message) => message.clientMessageId !== clientMessageId,
  );
}

function retryPendingMessage(clientMessageId: string) {
  const item = pendingMessages.value.find(
    (message) => message.clientMessageId === clientMessageId,
  );
  if (!item || item.status !== "failed") return;
  item.status = "queued";
  item.errorMessage = undefined;
  void processMessageQueue();
}

function pendingStatusText(status: PendingMessageStatus) {
  if (status === "failed") return "发送失败";
  return "待发送";
}

async function stopCurrent() {
  if (!activeRequestId.value || !activeSession.value) return;
  try {
    const execution = await getAgentExecutionByRequest(activeRequestId.value);
    const stopped = await stopAgentExecution(execution.id);
    if (disposed) return;
    if (stopped.status === "cancelled") {
      progressPoller.stop();
      executionProgress.value = {
        executionId: stopped.id,
        requestId: stopped.requestId,
        sessionId: stopped.sessionId,
        status: stopped.status,
        stage: null,
        startedAt: stopped.startedAt,
      };
    }
    ElMessage.info("已停止尚未完成的动作");
    requestVersion += 1;
    await loadSession(activeSession.value.id, true);
  } catch {
    ElMessage.warning("执行尚未建立或已经结束，请稍后查看会话结果");
  }
}

function handleEnter(event: KeyboardEvent) {
  if (event.isComposing || isComposing.value) return;
  void send();
}

async function handlePendingActionUpdate(pendingAction: AgentPendingAction, data: AgentPendingAction["data"]) {
  if (!activeSession.value) return;
  actionBusy.value = true;
  try {
    await updateAgentPendingAction(pendingAction.id, { version: pendingAction.version, data });
    confirmationKeys.delete(pendingAction.id);
    await loadSession(activeSession.value.id);
    ElMessage.success("待确认操作已更新，旧版本确认已失效");
  } finally {
    actionBusy.value = false;
  }
}

async function handlePendingActionConfirm(pendingAction: AgentPendingAction) {
  if (!activeSession.value) return;
  const key = confirmationKeys.get(pendingAction.id) ?? makeKey();
  confirmationKeys.set(pendingAction.id, key);
  const requestId = `pendingAction:${pendingAction.id}:${key}`;
  actionBusy.value = true;
  try {
    const result = await confirmAgentPendingAction(pendingAction.id, {
      version: pendingAction.version,
      idempotencyKey: key,
    });
    const receipt = result.execution.result;
    const hasReceipt =
      receipt?.recordType === pendingAction.toolKey.split(".")[0] &&
      typeof receipt.recordId === "number" &&
      Number.isInteger(receipt.recordId) &&
      receipt.recordId > 0;
    if (result.execution.status === "succeeded" && hasReceipt) {
      confirmationKeys.delete(pendingAction.id);
      ElMessage.success("业务数据已成功录入");
    } else {
      ElMessage.warning(
        result.execution.errorMessage ||
          (result.execution.status === "succeeded"
            ? "缺少真实录入回执，请先核实结果，不要重复提交"
            : "录入未完成，请检查待确认操作"),
      );
    }
    await Promise.all([loadSession(activeSession.value.id), loadSessions()]);
  } catch (error) {
    try {
      const execution = await getAgentExecutionByRequest(requestId);
      ElMessage.info(`正在核实提交结果：${execution.status}`);
      await loadSession(activeSession.value.id);
    } catch {
      throw error;
    }
  } finally {
    actionBusy.value = false;
  }
}

async function handlePendingActionCancel(pendingAction: AgentPendingAction) {
  if (!activeSession.value) return;
  actionBusy.value = true;
  try {
    await cancelAgentPendingAction(pendingAction.id);
    confirmationKeys.delete(pendingAction.id);
    await loadSession(activeSession.value.id);
    ElMessage.info("待确认操作已取消");
  } finally {
    actionBusy.value = false;
  }
}

onMounted(async () => {
  const [availableApps] = await Promise.all([getAvailableAgentApps()]);
  apps.value = availableApps;
  if (userStore.hasPermission("Product.read")) {
    try {
      products.value = await getProductOptions();
    } catch {
      products.value = [];
    }
  }
  if (!apps.value.length) return;
  selectedAgentId.value = String(apps.value[0].id);
  lastReadyAgentId = selectedAgentId.value;
  // 调试从空上下文开始，首次发送/上传或点击新会话才创建，不续接员工已有对话。
  if (props.debug) return;
  await loadSessions();
  if (sessions.value.length) await loadSession(sessions.value[0].id);
  else await newSession();
});

onUnmounted(() => {
  clearImage();
  disposed = true;
  progressPoller.stop();
  requestVersion += 1;
});
</script>

<template>
  <PageContainer
    class="agent-workspace-page"
    :class="{ 'is-debug': debug }"
    :title="debug ? 'Agent 调试' : 'Agent 工作台'"
  >
    <div v-if="!apps.length" class="agent-workspace__empty">
      <el-empty description="当前没有可使用的 Agent 应用" />
      <Button
        v-if="debug"
        perm="AgentApp.read"
        icon="Refresh"
        :loading="switchingAgent"
        @click="refreshDebugConfiguration"
        >刷新配置</Button
      >
    </div>
    <div v-else class="agent-workspace" :class="{ 'is-debug': debug }">
      <aside
        class="agent-workspace__sidebar"
        v-loading="loadingSessions || switchingAgent"
      >
        <div class="agent-workspace__agent-picker">
          <div class="agent-workspace__avatar is-sidebar">
            {{ currentAppInitial }}
          </div>
          <div class="agent-workspace__agent-select">
            <span>当前智能体</span>
            <Select
              v-model="selectedAgentId"
              class="agent-workspace__selector"
              :options="agentOptions"
              :clearable="false"
              :filterable="false"
              :disabled="
                hasPendingMessages ||
                actionBusy ||
                uploadBusy ||
                switchingAgent ||
                debugBusy
              "
              @change="switchAgent"
            />
            <small :title="currentApp?.responsibility">
              {{ currentApp?.responsibility }}
            </small>
          </div>
        </div>

        <div class="agent-workspace__session-actions">
          <Button
            class="agent-workspace__new-chat"
            type="primary"
            icon="Plus"
            :disabled="
              hasPendingMessages ||
              actionBusy ||
              uploadBusy ||
              switchingAgent ||
              debugBusy
            "
            @click="newSession"
            >{{ debug ? "新建调试会话" : "开启新对话" }}</Button
          >
          <Input
            v-if="!debug"
            v-model="sessionKeyword"
            mode="search"
            placeholder="搜索历史对话"
            :disabled="switchingAgent"
            @search="loadSessions"
          />
        </div>

        <AgentDebugPanel
          v-if="debug && currentApp"
          :app="currentApp"
          :executions="activeSession?.executions || []"
          :revision="debugRevision"
          :busy="hasPendingMessages || actionBusy || uploadBusy || debugBusy"
          @refresh="refreshDebugConfiguration"
        />
        <div v-if="!debug" class="agent-workspace__history-title">
          <span>最近对话</span>
          <span>{{ sessions.length }}</span>
        </div>
        <div v-if="!debug" class="agent-workspace__sessions">
          <button
            v-for="session in sessions"
            :key="session.id"
            class="agent-workspace__session"
            :class="{ 'is-active': activeSession?.id === session.id }"
            type="button"
            @click="selectSession(session)"
          >
            <el-icon class="agent-workspace__session-icon">
              <ChatDotRound />
            </el-icon>
            <span class="agent-workspace__session-content">
              <strong>{{ session.title }}</strong>
              <span>{{ session.lastMessage || "开始一段新的对话" }}</span>
              <time>{{ formatDateTime(session.updatedAt) }}</time>
            </span>
          </button>
          <div v-if="!sessions.length" class="agent-workspace__history-empty">
            暂无历史对话
          </div>
        </div>
      </aside>

      <section class="agent-workspace__main" v-loading="loadingDetail">
        <header class="agent-workspace__header">
          <p v-if="debug" class="agent-workspace__debug-notice">
            使用已保存配置进行真实调用，可能计费；确认写入会影响业务数据。
          </p>
          <div v-else class="agent-workspace__capabilities">
            <span
              v-for="item in capabilityLabels"
              :key="item.key"
              :class="{ 'is-active': item.active }"
            >
              {{ item.label }}
            </span>
          </div>
        </header>

        <main class="agent-workspace__chat">
          <AgentMessageList
            v-if="activeSession || debug"
            :agent-name="currentApp?.name || 'Agent'"
            :responsibility="currentApp?.responsibility || ''"
            :suggestions="promptSuggestions"
            :messages="visibleMessages"
            :pendingActions="activeSession?.pendingActions || []"
            :executions="activeSession?.executions || []"
            :products="products"
            :busy="hasPendingMessages || actionBusy || debugBusy"
            :processing="processingMessage"
            :has-more="hasOlderMessages"
            :loading-older="loadingOlderMessages"
            @update-pendingAction="handlePendingActionUpdate"
            @confirm-pendingAction="handlePendingActionConfirm"
            @cancel-pendingAction="handlePendingActionCancel"
            @prompt="sendPrompt"
            @load-older="loadOlderMessages"
          />
          <el-empty v-else description="请选择或新建会话" />
        </main>

        <footer class="agent-workspace__composer-shell">
          <div class="agent-workspace__composer">
            <div v-if="mediaHint" class="agent-workspace__media-toolbar">
              <Button
                v-if="currentApp?.mediaCapabilities?.vision"
                :type="getPermissionActionColor('read')"
                link
                icon="Picture"
                :disabled="uploadBusy || actionBusy || debugBusy"
                @click="showImagePicker = !showImagePicker"
                >添加图片</Button
              >
              <span>{{ mediaHint }}</span>
            </div>
            <UploadImage
              v-if="showImagePicker || attachedImage"
              v-model="imagePreview"
              class="agent-workspace__image-upload"
              :class="{ 'has-image': attachedImage }"
              accept="image/png,image/jpeg,image/webp"
              :max-size-mb="5"
              :disabled="
                uploadBusy ||
                actionBusy ||
                debugBusy ||
                (!activeSession && !debug)
              "
              :upload-request="uploadImage"
              @remove="clearImage"
            />
            <div
              v-if="composerPendingMessages.length"
              class="agent-workspace__queue"
            >
              <div
                v-for="item in composerPendingMessages"
                :key="item.clientMessageId"
                class="agent-workspace__queue-item"
                :class="`is-${item.status}`"
              >
                <span class="agent-workspace__queue-status">
                  {{ pendingStatusText(item.status) }}
                </span>
                <span
                  class="agent-workspace__queue-content"
                  :title="item.content"
                >
                  {{ item.content }}
                </span>
                <Button
                  v-if="item.status === 'failed'"
                  link
                  type="primary"
                  size="small"
                  icon="RefreshRight"
                  :confirm="false"
                  @click="retryPendingMessage(item.clientMessageId)"
                  >重试</Button
                >
                <Button
                  link
                  type="info"
                  size="small"
                  icon="Close"
                  :confirm="false"
                  @click="cancelPendingMessage(item.clientMessageId)"
                  >取消</Button
                >
              </div>
            </div>
            <Input
              v-model="inputText"
              class="agent-workspace__composer-input"
              mode="textarea"
              :rows="3"
              :maxlength="8000"
              :disabled="actionBusy || debugBusy"
              placeholder="给 Agent 发消息，描述需求或粘贴图片，由 AI 理解并处理…"
              @paste="pasteImage"
              @compositionstart="isComposing = true"
              @compositionend="isComposing = false"
              @keydown.enter.exact.prevent="handleEnter"
            />
            <div class="agent-workspace__composer-actions">
              <Select
                v-model="selectedTextModel"
                class="agent-workspace__model-select"
                :options="textModelOptions"
                :clearable="false"
                :filterable="false"
                :disabled="
                  actionBusy || debugBusy || (!activeSession && !debug)
                "
              />
              <span class="agent-workspace__composer-hint">
                <template v-if="sending">
                  Agent 正在处理，可继续输入并排队
                </template>
                <template v-else-if="actionBusy">正在提交并核实结果…</template>
                <template v-else>Enter 发送 · Shift + Enter 换行</template>
              </span>
              <Button
                v-if="sending"
                round
                icon="VideoPause"
                :confirm="false"
                @click="stopCurrent"
                >停止</Button
              >
              <Button
                class="agent-workspace__send"
                type="primary"
                round
                icon="Promotion"
                :disabled="
                  (!inputText.trim() && !attachedImage) ||
                  actionBusy ||
                  uploadBusy ||
                  debugBusy
                "
                @click="send"
                >{{ sending ? "加入队列" : "发送" }}</Button
              >
            </div>
          </div>
          <p>AI 生成内容仅供参考，重要业务操作请确认后提交</p>
        </footer>
      </section>
    </div>
  </PageContainer>
</template>

<style scoped>
.agent-workspace__media-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px 0;
}
.agent-workspace__media-toolbar :deep(.el-button) {
  flex-shrink: 0;
}
.agent-workspace__media-toolbar > span {
  font-size: 12px;
  line-height: 1.5;
  color: #606975;
}
.agent-workspace__image-upload {
  margin: 8px 16px 0;
}
.agent-workspace__image-upload.has-image :deep(.el-upload--picture-card) {
  display: none;
}
.agent-workspace__image-upload :deep(.el-upload--picture-card),
.agent-workspace__image-upload :deep(.el-upload-list__item) {
  width: 76px;
  height: 76px;
}
.agent-workspace-page {
  overflow: hidden;
  padding: 0;
  border-radius: 14px;
  box-shadow: 0 8px 28px rgb(31 35 41 / 6%);
}
.agent-workspace-page :deep(.page-container__body) {
  height: 100%;
}
.agent-workspace {
  display: grid;
  height: calc(100vh - 100px);
  min-height: 680px;
  grid-template-columns: 268px minmax(0, 1fr);
  overflow: hidden;
  background: #fff;
}
.agent-workspace__sidebar {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid #ebeef5;
  background: #f7f8fa;
}
.agent-workspace__agent-picker {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 14px 12px 12px;
  padding: 12px;
  border: 1px solid #dde5ef;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 14px rgb(31 35 41 / 5%);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.agent-workspace__agent-picker:focus-within {
  border-color: #8cc5ff;
  box-shadow: 0 6px 18px rgb(64 158 255 / 12%);
}
.agent-workspace__avatar {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  place-items: center;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  border-radius: 13px;
  background: linear-gradient(145deg, #79bbff, #409eff);
  box-shadow: 0 6px 16px rgb(64 158 255 / 24%);
}
.agent-workspace__avatar.is-sidebar {
  width: 42px;
  height: 42px;
  margin-top: 3px;
  flex-basis: 42px;
}
.agent-workspace__agent-select {
  min-width: 0;
  flex: 1;
}
.agent-workspace__agent-select > span {
  display: block;
  margin-bottom: 3px;
  color: #697386;
  font-size: 11px;
  font-weight: 500;
}
.agent-workspace__agent-select > small {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: #7c8592;
  font-size: 11px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-workspace__selector {
  width: 100%;
  font-weight: 600;
}
.agent-workspace__selector :deep(.select__control) {
  min-height: 30px;
  border: 1px solid #e1e7ef;
  border-radius: 8px;
  background: #f7faff;
}
.agent-workspace__selector.is-opened :deep(.select__control) {
  border-color: #79bbff;
  background: #fff;
}
.agent-workspace__selector :deep(.select__input) {
  height: 28px;
  padding-left: 9px;
  color: #1f2937;
  font-size: 15px;
}
.agent-workspace__session-actions {
  display: grid;
  gap: 10px;
  padding: 0 14px 18px;
}
.agent-workspace__session-actions :deep(.agent-workspace__new-chat) {
  width: 100%;
  height: 40px;
  border-radius: 10px;
}
.agent-workspace__session-actions :deep(.el-input__wrapper) {
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 0 0 1px #e7e9ee inset;
}
.agent-workspace__history-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px 9px;
  color: #909399;
  font-size: 12px;
  font-weight: 600;
}
.agent-workspace__history-title span:last-child {
  min-width: 22px;
  padding: 1px 7px;
  text-align: center;
  border-radius: 999px;
  background: #ebeef3;
}
.agent-workspace__sessions {
  min-height: 0;
  padding: 0 9px 16px;
  flex: 1;
  overflow-y: auto;
}
.agent-workspace__session {
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 4px;
  padding: 11px 10px;
  text-align: left;
  border: 0;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  transition:
    background-color 0.2s,
    box-shadow 0.2s;
}
.agent-workspace__session:hover {
  background: #eef0f4;
}
.agent-workspace__session.is-active {
  background: #fff;
  box-shadow: 0 4px 14px rgb(31 35 41 / 8%);
}
.agent-workspace__session-icon {
  margin-top: 2px;
  flex: 0 0 auto;
  color: #909399;
  font-size: 17px;
}
.agent-workspace__session.is-active .agent-workspace__session-icon {
  color: #409eff;
}
.agent-workspace__session-content {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}
.agent-workspace__session strong,
.agent-workspace__session span,
.agent-workspace__session time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-workspace__session strong {
  color: #303133;
  font-size: 13px;
  font-weight: 600;
}
.agent-workspace__session-content > span,
.agent-workspace__session time {
  color: #a0a3aa;
  font-size: 11px;
}
.agent-workspace__history-empty {
  padding: 36px 12px;
  color: #a8abb2;
  font-size: 12px;
  text-align: center;
}
.agent-workspace__main {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: #fff;
}
.agent-workspace__header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-start;
  min-height: 72px;
  padding: 12px 24px;
  border-bottom: 1px solid #f0f1f4;
}
.agent-workspace__capabilities {
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 6px;
}
.agent-workspace__capabilities span {
  padding: 5px 9px;
  color: #7d828a;
  font-size: 11px;
  line-height: 1;
  border-radius: 999px;
  background: #f2f3f5;
}
.agent-workspace__capabilities span.is-active {
  color: #409eff;
  background: #ecf5ff;
}
.agent-workspace__chat {
  min-height: 0;
  overflow: hidden;
}
.agent-workspace__composer-shell {
  position: relative;
  z-index: 2;
  padding: 12px 28px 13px;
  background: linear-gradient(180deg, rgb(246 248 251 / 60%), #f6f8fb 24%);
}
.agent-workspace__composer {
  display: grid;
  max-width: 880px;
  margin: 0 auto;
  overflow: visible;
  border: 1px solid #cbd5e1;
  border-radius: 18px;
  background: #fbfcfe;
  box-shadow: 0 10px 30px rgb(31 35 41 / 13%);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.agent-workspace__composer:focus-within {
  border-color: #409eff;
  box-shadow: 0 12px 32px rgb(64 158 255 / 18%);
}
.agent-workspace__queue {
  display: grid;
  gap: 6px;
  max-height: 132px;
  padding: 10px 12px 0;
  overflow-y: auto;
}
.agent-workspace__queue-item {
  display: flex;
  min-width: 0;
  min-height: 34px;
  align-items: center;
  gap: 8px;
  padding: 5px 6px 5px 10px;
  color: #606266;
  font-size: 12px;
  border-radius: 9px;
  background: #f5f7fa;
}
.agent-workspace__queue-item.is-failed {
  background: #fef0f0;
}
.agent-workspace__queue-status {
  flex: 0 0 auto;
  color: #909399;
  font-weight: 600;
}
.agent-workspace__queue-item.is-failed .agent-workspace__queue-status {
  color: #f56c6c;
}
.agent-workspace__queue-content {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-workspace__queue-item :deep(.el-button) {
  min-height: 24px;
  padding: 2px 4px;
}
.agent-workspace__composer
  :deep(.agent-workspace__composer-input .el-textarea__inner) {
  min-height: 78px !important;
  padding: 15px 17px 7px;
  color: #252b35;
  font-size: 14px;
  line-height: 1.65;
  resize: none;
  border: 0;
  background: transparent;
  box-shadow: none;
}
.agent-workspace__composer
  :deep(.agent-workspace__composer-input .el-textarea__inner::placeholder) {
  color: #747e8c;
  opacity: 1;
}
.agent-workspace__composer-actions {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 7px 10px 9px 16px;
  border-top: 1px solid #e8edf3;
  border-radius: 0 0 18px 18px;
  background: #f8fafc;
}
.agent-workspace__model-select {
  width: 172px;
  margin-right: auto;
  font-weight: 500;
}
.agent-workspace__model-select :deep(.select__control) {
  min-height: 30px;
  border-color: #cfd8e5;
  border-radius: 8px;
  background: #fff;
}
.agent-workspace__model-select :deep(.select__input) {
  height: 28px;
  color: #303744;
  font-size: 12px;
}
.agent-workspace__composer-hint {
  color: #687280;
  font-size: 11px;
}
.agent-workspace__composer-actions :deep(.agent-workspace__send) {
  min-width: 82px;
}
.agent-workspace__composer-shell > p {
  margin: 7px 0 0;
  color: #7d8692;
  font-size: 11px;
  text-align: center;
}
.agent-workspace__empty {
  display: grid;
  min-height: calc(100vh - 100px);
  place-items: center;
}
@media (max-width: 760px) {
  .agent-workspace {
    height: auto;
    min-height: calc(100vh - 100px);
    grid-template-columns: 1fr;
    grid-template-rows: auto 720px;
  }
  .agent-workspace__sidebar {
    border-right: 0;
    border-bottom: 1px solid #ebeef5;
  }
  .agent-workspace__agent-picker {
    margin-bottom: 10px;
  }
  .agent-workspace__session-actions {
    grid-template-columns: 1fr 1fr;
  }
  .agent-workspace__history-title {
    display: none;
  }
  .agent-workspace__sessions {
    display: flex;
    gap: 6px;
    padding: 0 14px 12px;
    overflow-x: auto;
  }
  .agent-workspace__session {
    width: 220px;
    flex: 0 0 220px;
  }
  .agent-workspace__composer-shell {
    padding-right: 14px;
    padding-left: 14px;
  }
  .agent-workspace__composer-hint {
    display: none;
  }
  .agent-workspace__model-select {
    width: 154px;
  }
}
/* 调试态独立适配：不改变员工工作台的尺寸与历史列表。 */
.agent-workspace-page.is-debug {
  min-width: 0;
  container-type: inline-size;
}
.agent-workspace.is-debug {
  grid-template-columns: 320px minmax(0, 1fr);
}
.is-debug .agent-workspace__sidebar {
  overflow-y: auto;
}
.is-debug .agent-workspace__session-actions {
  grid-template-columns: minmax(0, 1fr);
}
.is-debug .agent-workspace__agent-select > small {
  overflow: visible;
  white-space: normal;
  overflow-wrap: anywhere;
  color: #606975;
}
.agent-workspace__debug-notice {
  margin: 0;
  color: #606975;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.is-debug :deep(.message-list__welcome h2),
.is-debug :deep(.message-list__welcome > p),
.is-debug :deep(.message-list__suggestions small),
.is-debug :deep(.message-list__author) {
  overflow-wrap: anywhere;
  white-space: normal;
  overflow: visible;
}
.is-debug :deep(.message-list__body) {
  min-width: 0;
}
@container (max-width: 1000px) {
  .agent-workspace.is-debug {
    height: auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
  }
  .is-debug .agent-workspace__sidebar {
    max-height: 440px;
    border-right: 0;
    border-bottom: 1px solid #ebeef5;
  }
  .is-debug .agent-workspace__main {
    height: max(600px, calc(100vh - 120px));
  }
  .is-debug .agent-workspace__composer-actions {
    flex-wrap: wrap;
  }
}
</style>
