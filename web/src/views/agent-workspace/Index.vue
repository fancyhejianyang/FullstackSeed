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
  type AgentSession,
  type AgentSessionDetail,
  type AgentSkuDraftData,
  type AvailableAgentApp,
} from "@/api/agentWorkspace";
import AgentMessageList from "./components/AgentMessageList.vue";

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
let requestVersion = 0;
const confirmationKeys = new Map<number, string>();

const currentApp = computed(() =>
  apps.value.find((item) => item.id === Number(selectedAgentId.value)),
);
const agentOptions = computed(() =>
  apps.value.map((item) => ({ value: String(item.id), text: item.name })),
);

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

async function loadSession(id: number) {
  const version = ++requestVersion;
  loadingDetail.value = true;
  try {
    const detail = await getAgentSession(id);
    if (version !== requestVersion) return;
    activeSession.value = detail;
  } finally {
    if (version === requestVersion) loadingDetail.value = false;
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
  if (sending.value || actionBusy.value) {
    ElMessage.warning("当前动作处理完成后再切换会话");
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
  if (!content || sending.value || isComposing.value) return;
  const sessionId = await ensureSession();
  const clientMessageId = makeKey();
  const requestId = `message:${sessionId}:${clientMessageId}`;
  const version = requestVersion;
  inputText.value = "";
  activeRequestId.value = requestId;
  sending.value = true;
  try {
    await sendAgentMessage(sessionId, { content, clientMessageId });
    if (version === requestVersion && activeSession.value?.id === sessionId) {
      await Promise.all([loadSession(sessionId), loadSessions()]);
    }
  } catch (error) {
    try {
      await getAgentExecutionByRequest(requestId);
      if (version === requestVersion) await loadSession(sessionId);
    } catch {
      inputText.value = content;
      throw error;
    }
  } finally {
    sending.value = false;
    activeRequestId.value = "";
  }
}

async function stopCurrent() {
  if (!activeRequestId.value || !activeSession.value) return;
  try {
    const execution = await getAgentExecutionByRequest(activeRequestId.value);
    await stopAgentExecution(execution.id);
    ElMessage.info("已停止尚未完成的动作");
    requestVersion += 1;
    await loadSession(activeSession.value.id);
  } catch {
    ElMessage.warning("执行尚未建立或已经结束，请稍后查看会话结果");
  }
}

function handleEnter(event: KeyboardEvent) {
  if (event.isComposing || isComposing.value) return;
  send();
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
  <PageContainer title="Agent 工作台">
    <div v-if="!apps.length" class="agent-workspace__empty">
      <el-empty description="当前没有可使用的 Agent 应用" />
    </div>
    <div v-else class="agent-workspace">
      <header class="agent-workspace__header">
        <Select
          v-model="selectedAgentId"
          class="agent-workspace__selector"
          :options="agentOptions"
          :clearable="false"
          :disabled="sending || actionBusy"
          @change="switchAgent"
        />
        <div class="agent-workspace__identity">
          <strong>{{ currentApp?.name }}</strong>
          <span>{{ currentApp?.responsibility }}</span>
        </div>
        <div class="agent-workspace__capabilities">
          <el-tag type="info">模型对话</el-tag>
          <el-tag v-if="currentApp?.knowledgeEnabled" type="success">
            知识增强
          </el-tag>
          <el-tag
            v-for="key in currentApp?.toolKeys || []"
            :key="key"
            type="info"
            >{{ key === "product.query" ? "产品/SKU 查询" : "受控新增 SKU" }}</el-tag
          >
        </div>
      </header>

      <div class="agent-workspace__body">
        <aside class="agent-workspace__sessions" v-loading="loadingSessions">
          <div class="agent-workspace__session-actions">
            <Button
              icon="Plus"
              :disabled="sending || actionBusy"
              @click="newSession"
              >新会话</Button
            >
            <Input
              v-model="sessionKeyword"
              mode="search"
              placeholder="搜索历史"
              @search="loadSessions"
            />
          </div>
          <button
            v-for="session in sessions"
            :key="session.id"
            class="agent-workspace__session"
            :class="{ 'is-active': activeSession?.id === session.id }"
            type="button"
            @click="selectSession(session)"
          >
            <strong>{{ session.title }}</strong>
            <span>{{ session.lastMessage || "暂无消息" }}</span>
            <time>{{ formatDateTime(session.updatedAt) }}</time>
          </button>
        </aside>

        <main class="agent-workspace__chat" v-loading="loadingDetail">
          <AgentMessageList
            v-if="activeSession"
            :messages="activeSession.messages"
            :drafts="activeSession.drafts"
            :executions="activeSession.executions"
            :products="products"
            :busy="actionBusy"
            @update-draft="handleDraftUpdate"
            @confirm-draft="handleDraftConfirm"
            @cancel-draft="handleDraftCancel"
          />
          <el-empty v-else description="请选择或新建会话" />

          <footer class="agent-workspace__composer">
            <Input
              v-model="inputText"
              mode="textarea"
              :rows="3"
              :maxlength="8000"
              :disabled="sending || actionBusy"
              placeholder="描述问题、查询条件或录入需求。Enter 发送，Shift+Enter 换行。"
              @compositionstart="isComposing = true"
              @compositionend="isComposing = false"
              @keydown.enter.exact.prevent="handleEnter"
            />
            <div class="agent-workspace__composer-actions">
              <el-tag v-if="sending" type="primary">正在处理</el-tag>
              <el-tag v-else-if="actionBusy" type="warning"
                >正在提交并核实结果</el-tag
              >
              <Button
                v-if="sending"
                icon="VideoPause"
                :confirm="false"
                @click="stopCurrent"
                >停止</Button
              >
              <Button
                icon="Promotion"
                :loading="sending"
                :disabled="!inputText.trim() || actionBusy"
                @click="send"
                >发送</Button
              >
            </div>
          </footer>
        </main>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
.agent-workspace {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 150px);
  min-height: 620px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
}
.agent-workspace__header {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 74px;
  padding: 12px 18px;
  border-bottom: 1px solid #dcdfe6;
  background: #fff;
}
.agent-workspace__selector {
  width: 220px;
  flex: 0 0 auto;
}
.agent-workspace__identity {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}
.agent-workspace__identity span {
  overflow: hidden;
  color: #606266;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-workspace__capabilities {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.agent-workspace__body {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 280px minmax(0, 1fr);
}
.agent-workspace__sessions {
  overflow-y: auto;
  border-right: 1px solid #dcdfe6;
  background: #fff;
}
.agent-workspace__session-actions {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-bottom: 1px solid #ebeef5;
}
.agent-workspace__session {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 5px;
  padding: 13px 15px;
  text-align: left;
  border: 0;
  border-bottom: 1px solid #ebeef5;
  background: transparent;
  cursor: pointer;
  transition: background 0.2s;
}
.agent-workspace__session:hover,
.agent-workspace__session.is-active {
  background: rgba(64, 158, 255, 0.12);
}
.agent-workspace__session strong,
.agent-workspace__session span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-workspace__session span,
.agent-workspace__session time {
  color: #909399;
  font-size: 12px;
}
.agent-workspace__chat {
  display: grid;
  min-height: 0;
  grid-template-rows: minmax(0, 1fr) auto;
}
.agent-workspace__composer {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-top: 1px solid #dcdfe6;
  background: #fff;
}
.agent-workspace__composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.agent-workspace__empty {
  min-height: 500px;
  display: grid;
  place-items: center;
}
@media (max-width: 900px) {
  .agent-workspace {
    height: auto;
    min-height: 720px;
  }
  .agent-workspace__header {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .agent-workspace__selector {
    width: 100%;
  }
  .agent-workspace__capabilities {
    justify-content: flex-start;
  }
  .agent-workspace__body {
    grid-template-columns: 1fr;
    grid-template-rows: 190px minmax(500px, 1fr);
  }
  .agent-workspace__sessions {
    border-right: 0;
    border-bottom: 1px solid #dcdfe6;
  }
}
</style>
