<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import PageContainer from "@/components/PageContainer.vue";
import Button from "@/components/Button.vue";
import Input from "@/components/Input.vue";
import Select from "@/components/Select.vue";
import { useUserStore } from "@/stores/user";
import { formatDateTime } from "@/utils/format";
import { getProductOptions, type ProductOption } from "@/api/productCatalog";
import {
  cancelAgentDraft,
  confirmAgentDraft,
  createAgentSession,
  getAgentExecutionByRequest,
  getAgentSession,
  getAgentSessions,
  getAvailableAgentApps,
  sendAgentMessage,
  stopAgentExecution,
  updateAgentDraft,
  type AgentDraft,
  type AgentMessage,
  type AgentSession,
  type AgentSessionDetail,
  type AgentSkuDraftData,
  type AvailableAgentApp,
} from "@/api/agentWorkspace";
import AgentMessageList from "./components/AgentMessageList.vue";

interface AgentPromptSuggestion {
  kind: "chat" | "query" | "write";
  title: string;
  description: string;
  prompt: string;
}

type PendingMessageStatus = "queued" | "sending" | "failed";

interface PendingAgentMessage {
  id: number;
  sessionId: number;
  content: string;
  clientMessageId: string;
  requestId: string;
  status: PendingMessageStatus;
  errorMessage?: string;
  createdAt: string;
}

const userStore = useUserStore();
const apps = ref<AvailableAgentApp[]>([]);
const selectedAgentId = ref<string | null>(null);
const sessions = ref<AgentSession[]>([]);
const activeSession = ref<AgentSessionDetail | null>(null);
const products = ref<ProductOption[]>([]);
const sessionKeyword = ref("");
const inputText = ref("");
const loadingSessions = ref(false);
const loadingDetail = ref(false);
const sending = ref(false);
const actionBusy = ref(false);
const isComposing = ref(false);
const activeRequestId = ref("");
const pendingMessages = ref<PendingAgentMessage[]>([]);
let requestVersion = 0;
let localMessageId = -1;
let queueProcessing = false;
const confirmationKeys = new Map<number, string>();

const currentApp = computed(() =>
  apps.value.find((item) => item.id === Number(selectedAgentId.value)),
);
const agentOptions = computed(() =>
  apps.value.map((item) => ({ value: String(item.id), text: item.name })),
);
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
      structuredData: null,
      executionId: null,
      clientMessageId: item.clientMessageId,
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
    }));
  return [...serverMessages, ...optimisticMessages];
});
const capabilityLabels = computed(() => {
  const result = [{ key: "model", label: "模型对话", active: false }];
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
  if (currentApp.value?.toolKeys.includes("product.query")) {
    result.push({
      kind: "query",
      title: "查询业务数据",
      description: "用自然语言查找产品或 SKU",
      prompt: "帮我查询一个产品或 SKU，我稍后补充名称或编码。",
    });
  }
  if (currentApp.value?.toolKeys.includes("productSku.create")) {
    result.push({
      kind: "write",
      title: "创建录入草稿",
      description: "整理信息，确认后再受控写入",
      prompt: "我想新增一个 SKU，请引导我补充所需信息。",
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
  if (!selectedAgentId.value) {
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

async function newSession() {
  if (!selectedAgentId.value) return;
  requestVersion += 1;
  const session = await createAgentSession({
    agentAppId: Number(selectedAgentId.value),
  });
  await loadSessions();
  await loadSession(session.id);
}

async function switchAgent() {
  requestVersion += 1;
  activeSession.value = null;
  sessionKeyword.value = "";
  await loadSessions();
  await newSession();
}

async function selectSession(session: AgentSession) {
  if (hasPendingMessages.value || actionBusy.value) {
    ElMessage.warning("请先处理待发送消息或等待当前动作完成");
    return;
  }
  await loadSession(session.id);
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
  const content = inputText.value.trim();
  if (!content || actionBusy.value || isComposing.value) return;
  let sessionId: number;
  try {
    sessionId = await ensureSession();
  } catch {
    return;
  }
  const clientMessageId = makeKey();
  const requestId = `message:${sessionId}:${clientMessageId}`;
  inputText.value = "";
  pendingMessages.value.push({
    id: localMessageId--,
    sessionId,
    content,
    clientMessageId,
    requestId,
    status: "queued",
    createdAt: new Date().toISOString(),
  });
  void processMessageQueue();
}

async function processMessageQueue() {
  if (queueProcessing) return;
  queueProcessing = true;
  try {
    let item = pendingMessages.value.find(
      (message) => message.status === "queued",
    );
    while (item) {
      item.status = "sending";
      item.errorMessage = undefined;
      sending.value = true;
      activeRequestId.value = item.requestId;
      let accepted = false;
      try {
        await sendAgentMessage(item.sessionId, {
          content: item.content,
          clientMessageId: item.clientMessageId,
        });
        accepted = true;
      } catch {
        try {
          await getAgentExecutionByRequest(item.requestId);
          accepted = true;
        } catch {
          item.status = "failed";
          item.errorMessage = "发送失败，请重试或取消";
          ElMessage.error("消息发送失败，已保留在待发送列表");
        }
      }
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
    sending.value = false;
    activeRequestId.value = "";
    queueProcessing = false;
  }
}

function sendPrompt(prompt: string) {
  if (actionBusy.value) return;
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
    await stopAgentExecution(execution.id);
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

async function handleDraftUpdate(draft: AgentDraft, data: AgentSkuDraftData) {
  if (!activeSession.value) return;
  actionBusy.value = true;
  try {
    await updateAgentDraft(draft.id, { version: draft.version, data });
    await loadSession(activeSession.value.id);
    ElMessage.success("草稿已更新，旧版本确认已失效");
  } finally {
    actionBusy.value = false;
  }
}

async function handleDraftConfirm(draft: AgentDraft) {
  if (!activeSession.value) return;
  const key = confirmationKeys.get(draft.id) ?? makeKey();
  confirmationKeys.set(draft.id, key);
  const requestId = `draft:${draft.id}:${key}`;
  actionBusy.value = true;
  try {
    const result = await confirmAgentDraft(draft.id, {
      version: draft.version,
      idempotencyKey: key,
    });
    if (result.execution.status === "succeeded") {
      confirmationKeys.delete(draft.id);
      ElMessage.success("SKU 已成功录入");
    } else {
      ElMessage.warning(
        result.execution.errorMessage || "录入未完成，请检查草稿",
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

async function handleDraftCancel(draft: AgentDraft) {
  if (!activeSession.value) return;
  actionBusy.value = true;
  try {
    await cancelAgentDraft(draft.id);
    confirmationKeys.delete(draft.id);
    await loadSession(activeSession.value.id);
    ElMessage.info("草稿已取消");
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
  await loadSessions();
  if (sessions.value.length) await loadSession(sessions.value[0].id);
  else await newSession();
});
</script>

<template>
  <PageContainer class="agent-workspace-page" title="Agent 工作台">
    <div v-if="!apps.length" class="agent-workspace__empty">
      <el-empty description="当前没有可使用的 Agent 应用" />
    </div>
    <div v-else class="agent-workspace">
      <aside class="agent-workspace__sidebar" v-loading="loadingSessions">
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
              :disabled="hasPendingMessages || actionBusy"
              @change="switchAgent"
            />
          </div>
        </div>

        <div class="agent-workspace__session-actions">
          <Button
            class="agent-workspace__new-chat"
            type="primary"
            icon="Plus"
            :disabled="hasPendingMessages || actionBusy"
            @click="newSession"
            >开启新对话</Button
          >
          <Input
            v-model="sessionKeyword"
            mode="search"
            placeholder="搜索历史对话"
            @search="loadSessions"
          />
        </div>

        <div class="agent-workspace__history-title">
          <span>最近对话</span>
          <span>{{ sessions.length }}</span>
        </div>
        <div class="agent-workspace__sessions">
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
          <div class="agent-workspace__identity">
            <div class="agent-workspace__avatar">
              {{ currentAppInitial }}
            </div>
            <div>
              <strong>{{ currentApp?.name }}</strong>
              <span> <i />在线 · {{ currentApp?.responsibility }} </span>
            </div>
          </div>
          <div class="agent-workspace__capabilities">
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
            v-if="activeSession"
            :agent-name="currentApp?.name || 'Agent'"
            :responsibility="currentApp?.responsibility || ''"
            :suggestions="promptSuggestions"
            :messages="visibleMessages"
            :drafts="activeSession.drafts"
            :executions="activeSession.executions"
            :products="products"
            :busy="hasPendingMessages || actionBusy"
            @update-draft="handleDraftUpdate"
            @confirm-draft="handleDraftConfirm"
            @cancel-draft="handleDraftCancel"
            @prompt="sendPrompt"
          />
          <el-empty v-else description="请选择或新建会话" />
        </main>

        <footer class="agent-workspace__composer-shell">
          <div class="agent-workspace__composer">
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
              :disabled="actionBusy"
              placeholder="给 Agent 发消息，或描述查询、录入需求…"
              @compositionstart="isComposing = true"
              @compositionend="isComposing = false"
              @keydown.enter.exact.prevent="handleEnter"
            />
            <div class="agent-workspace__composer-actions">
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
                :disabled="!inputText.trim() || actionBusy"
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
  align-items: center;
  gap: 12px;
  padding: 22px 18px 16px;
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
  flex-basis: 42px;
}
.agent-workspace__agent-select {
  min-width: 0;
  flex: 1;
}
.agent-workspace__agent-select > span {
  display: block;
  margin-bottom: 3px;
  color: #909399;
  font-size: 11px;
}
.agent-workspace__selector {
  width: 100%;
  font-weight: 600;
}
.agent-workspace__selector :deep(.select__control) {
  min-height: 28px;
  border: 0;
  background: transparent;
}
.agent-workspace__selector :deep(.select__input) {
  height: 28px;
  padding-left: 0;
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
  justify-content: space-between;
  gap: 20px;
  min-height: 72px;
  padding: 12px 24px;
  border-bottom: 1px solid #f0f1f4;
}
.agent-workspace__identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}
.agent-workspace__identity > div:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.agent-workspace__identity strong {
  color: #1f2329;
  font-size: 16px;
}
.agent-workspace__identity span {
  overflow: hidden;
  color: #8f959e;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-workspace__identity i {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 5px;
  border-radius: 50%;
  background: #67c23a;
  vertical-align: 1px;
}
.agent-workspace__capabilities {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
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
  background: linear-gradient(180deg, rgb(255 255 255 / 70%), #fff 24%);
}
.agent-workspace__composer {
  display: grid;
  max-width: 880px;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid #dfe3eb;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 26px rgb(31 35 41 / 10%);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.agent-workspace__composer:focus-within {
  border-color: #9acbff;
  box-shadow: 0 10px 30px rgb(64 158 255 / 14%);
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
  min-height: 68px !important;
  padding: 15px 17px 7px;
  resize: none;
  border: 0;
  box-shadow: none;
}
.agent-workspace__composer-actions {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 4px 10px 9px 16px;
}
.agent-workspace__composer-hint {
  margin-right: auto;
  color: #a8abb2;
  font-size: 11px;
}
.agent-workspace__composer-actions :deep(.agent-workspace__send) {
  min-width: 82px;
}
.agent-workspace__composer-shell > p {
  margin: 7px 0 0;
  color: #b0b3b8;
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
    padding-bottom: 10px;
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
  .agent-workspace__header {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
  .agent-workspace__capabilities {
    justify-content: flex-start;
  }
  .agent-workspace__composer-shell {
    padding-right: 14px;
    padding-left: 14px;
  }
  .agent-workspace__composer-hint {
    display: none;
  }
}
</style>
