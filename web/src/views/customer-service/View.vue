<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Button from '@/components/Button.vue';
import Form, { type FormField } from '@/components/Form.vue';
import { useUserStore } from '@/stores/user';
import { formatDateTime } from '@/utils/format';
import { getPermissionActionColor } from '@/utils/permission';
import {
  claimCustomerServiceSession,
  closeCustomerServiceSession,
  getCustomerServiceSession,
  sendCustomerServiceMessage,
  type CustomerServiceMessage,
  type CustomerServiceSnapshot,
} from '@/api/customerService';

const props = defineProps<{ sessionId: number | null }>();
const emit = defineEmits<{ changed: [] }>();
const userStore = useUserStore();
const detail = ref<CustomerServiceSnapshot | null>(null);
const loading = ref(false);
const loadingOlder = ref(false);
const busy = ref(false);
const pollingPaused = ref(false);
const messageContainer = ref<HTMLElement>();
const formRef = ref<InstanceType<typeof Form>>();
const form = reactive({ content: '' });
const unsentContents = new Map<number, string>();
const attempts = new Map<number, { clientMessageId: string; content: string }>();
let selectedGeneration = 0;
let snapshotRevision = 0;
let latestDetailRequest = 0;
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let olderLoaded = false;
let nextBeforeMessageId: number | null = null;
const hasMoreMessages = ref(false);

const isMine = computed(() => Boolean(
  detail.value?.serviceStatus === 'human' &&
  detail.value.assignedAgentId === userStore.userInfo?.id,
));
const canClaim = computed(() => Boolean(
  detail.value && !detail.value.assignedAgentId &&
  (detail.value.serviceStatus === 'ai' || detail.value.serviceStatus === 'waiting_human'),
));
const canSend = computed(() => isMine.value && userStore.hasPermission('CustomerService.create'));
const title = computed(() => detail.value?.title || `会话 #${props.sessionId}`);
const statusText = computed(() => {
  const session = detail.value;
  if (!session) return '';
  if (session.serviceStatus === 'closed') return '接待已结束';
  if (session.serviceStatus === 'human') return `人工接待 · ${session.assignedAgentName || '客服'}`;
  if (session.serviceStatus === 'waiting_human') return '访客正在等待人工客服';
  if (session.activeTask?.status === 'queued') return `AI 排队中${session.queuePosition ? ` · 第 ${session.queuePosition} 位` : ''}`;
  if (session.activeTask?.status === 'running') return 'AI 正在回答';
  if (session.activeTask?.status === 'cancelling') return 'AI 正在停止';
  return 'AI 接待中';
});
const fields = computed<FormField[]>(() => [{
  prop: 'content',
  label: '回复',
  type: 'textarea',
  rows: 3,
  placeholder: isMine.value ? '输入回复内容，Ctrl / ⌘ + Enter 发送' : '请先接手会话后回复',
  componentProps: { disabled: !canSend.value || busy.value, maxlength: 10000, showWordLimit: true },
}]);
const rules: FormRules = {
  content: [{ validator: (_rule, value, callback) => {
    if (typeof value !== 'string' || !value.trim()) callback(new Error('请输入回复内容'));
    else if (value.length > 10000) callback(new Error('回复内容不能超过 10000 字'));
    else callback();
  }, trigger: 'blur' }],
};

function roleName(message: CustomerServiceMessage) {
  return { user: '访客', ai: 'AI 客服', agent: message.agentName || '人工客服', system: '系统通知' }[message.role];
}

function mergeMessages(current: CustomerServiceMessage[], incoming: CustomerServiceMessage[]) {
  const map = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) map.set(message.id, message);
  return [...map.values()].sort((left, right) => left.id - right.id);
}

function nearBottom() {
  const element = messageContainer.value;
  return !element || element.scrollHeight - element.scrollTop - element.clientHeight < 80;
}

async function applySnapshot(snapshot: CustomerServiceSnapshot, forceBottom = false) {
  if (detail.value && snapshot.serviceVersion < detail.value.serviceVersion) {
    detail.value.messages = mergeMessages(detail.value.messages, snapshot.messages);
    return;
  }
  const shouldScroll = forceBottom || nearBottom();
  const generation = selectedGeneration;
  detail.value = { ...snapshot, messages: mergeMessages(detail.value?.messages ?? [], snapshot.messages) };
  if (!olderLoaded) {
    hasMoreMessages.value = snapshot.hasMoreMessages;
    nextBeforeMessageId = snapshot.nextBeforeMessageId;
  }
  await nextTick();
  if (generation !== selectedGeneration || disposed) return;
  if (shouldScroll && messageContainer.value) {
    messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
  }
}

async function fetchDetail(initial = false) {
  const sessionId = props.sessionId;
  if (!sessionId || disposed || busy.value) return;
  const generation = selectedGeneration;
  const revision = snapshotRevision;
  const requestId = ++latestDetailRequest;
  if (initial) loading.value = true;
  try {
    const snapshot = await getCustomerServiceSession(sessionId);
    // 接手/发送后的旧轮询，以及切换会话前的响应，都不能覆盖当前接待。
    if (disposed || generation !== selectedGeneration || revision !== snapshotRevision || requestId !== latestDetailRequest) return;
    await applySnapshot(snapshot, initial);
  } catch {
    if (generation === selectedGeneration && requestId === latestDetailRequest && !disposed) pollingPaused.value = true;
  } finally {
    if (generation === selectedGeneration && requestId === latestDetailRequest) loading.value = false;
  }
}

function schedulePoll() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (disposed) return;
    if (!pollingPaused.value && !document.hidden) await fetchDetail();
    if (!disposed) schedulePoll();
  }, 1500);
}

watch(() => props.sessionId, async (sessionId, previousId) => {
  if (previousId) unsentContents.set(previousId, form.content);
  selectedGeneration += 1;
  snapshotRevision += 1;
  clearTimeout(timer);
  detail.value = null;
  form.content = sessionId ? unsentContents.get(sessionId) || '' : '';
  loading.value = false;
  loadingOlder.value = false;
  busy.value = false;
  pollingPaused.value = false;
  olderLoaded = false;
  hasMoreMessages.value = false;
  nextBeforeMessageId = null;
  if (sessionId) {
    const generation = selectedGeneration;
    await fetchDetail(true);
    if (!disposed && generation === selectedGeneration) schedulePoll();
  }
}, { immediate: true });

async function retryRefresh() {
  pollingPaused.value = false;
  await fetchDetail(!detail.value);
}

async function loadOlderMessages() {
  const sessionId = props.sessionId;
  const cursor = nextBeforeMessageId;
  if (!sessionId || !cursor || loadingOlder.value) return;
  const generation = selectedGeneration;
  loadingOlder.value = true;
  const height = messageContainer.value?.scrollHeight || 0;
  const top = messageContainer.value?.scrollTop || 0;
  try {
    const snapshot = await getCustomerServiceSession(sessionId, cursor);
    if (disposed || generation !== selectedGeneration || !detail.value) return;
    // 历史请求仅补消息，不用可能过期的会话状态覆盖正在接待的详情。
    detail.value.messages = mergeMessages(detail.value.messages, snapshot.messages);
    olderLoaded = true;
    hasMoreMessages.value = snapshot.hasMoreMessages;
    nextBeforeMessageId = snapshot.nextBeforeMessageId;
    await nextTick();
    if (generation === selectedGeneration && messageContainer.value) {
      messageContainer.value.scrollTop = top + messageContainer.value.scrollHeight - height;
    }
  } catch {
    // 统一请求层展示错误；保留已加载的消息和历史游标供重试。
  } finally {
    if (generation === selectedGeneration) loadingOlder.value = false;
  }
}

async function performAction(action: (id: number) => Promise<CustomerServiceSnapshot>, success: string) {
  const sessionId = props.sessionId;
  if (!sessionId || busy.value) return;
  if (action === claimCustomerServiceSession && !canClaim.value) return;
  if (action === closeCustomerServiceSession && !isMine.value) return;
  const generation = selectedGeneration;
  snapshotRevision += 1;
  busy.value = true;
  try {
    const snapshot = await action(sessionId);
    if (disposed || generation !== selectedGeneration) return;
    await applySnapshot(snapshot);
    pollingPaused.value = false;
    ElMessage.success(success);
    emit('changed');
  } catch {
    // 接手竞争由服务端裁决；重新读取实际归属，不能本地猜测接手成功。
  } finally {
    if (generation === selectedGeneration) {
      busy.value = false;
      await fetchDetail();
    }
  }
}

async function sendMessage() {
  const sessionId = props.sessionId;
  if (!sessionId || !canSend.value || busy.value) return;
  const generation = selectedGeneration;
  const content = form.content.trim();
  try { await formRef.value?.validate(); } catch { return; }
  // 异步校验期间可能切换会话或重复按发送，不能把新会话输入发进旧会话。
  if (generation !== selectedGeneration || props.sessionId !== sessionId || busy.value || !canSend.value) return;
  const previousAttempt = attempts.get(sessionId);
  const attempt = previousAttempt?.content === content ? previousAttempt : {
    clientMessageId: globalThis.crypto.randomUUID?.() ?? Array.from(
      globalThis.crypto.getRandomValues(new Uint8Array(16)),
      (value) => value.toString(16).padStart(2, '0'),
    ).join(''),
    content,
  };
  attempts.set(sessionId, attempt);
  snapshotRevision += 1;
  busy.value = true;
  try {
    const snapshot = await sendCustomerServiceMessage(sessionId, attempt);
    if (attempts.get(sessionId)?.clientMessageId === attempt.clientMessageId) attempts.delete(sessionId);
    if (unsentContents.get(sessionId)?.trim() === content) unsentContents.delete(sessionId);
    if (props.sessionId === sessionId && form.content.trim() === content) form.content = '';
    if (disposed || generation !== selectedGeneration) return;
    await applySnapshot(snapshot, true);
    pollingPaused.value = false;
    emit('changed');
  } catch {
    // 保留原文和同一个 clientMessageId，超时重试不会产生重复消息。
  } finally {
    if (generation === selectedGeneration) busy.value = false;
  }
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
    event.preventDefault();
    void sendMessage();
  }
}

onBeforeUnmount(() => {
  disposed = true;
  selectedGeneration += 1;
  clearTimeout(timer);
});
</script>

<template>
  <section v-loading="loading" class="customer-conversation" aria-label="聊天接待">
    <el-empty v-if="!sessionId" description="选择一个会话，查看记录或接手接待" />
    <template v-else>
      <header class="customer-conversation__header">
        <div>
          <h3>{{ title }}</h3>
          <p>{{ detail?.appName || '聊天应用' }} · 会话 #{{ sessionId }}</p>
          <el-tag v-if="detail" :type="getPermissionActionColor(isMine ? 'CustomerService.update' : 'CustomerService.read')">{{ statusText }}</el-tag>
        </div>
        <div class="customer-conversation__actions">
          <Button v-if="canClaim" perm="CustomerService.update" :auto-icon="false" :disabled="busy" @click="(_event, done) => done(performAction(claimCustomerServiceSession, '已接手会话'))">接手会话</Button>
          <Button v-if="isMine" perm="CustomerService.update" :auto-icon="false" :disabled="busy" confirm confirm-text="确定结束本次人工接待吗？结束后不会自动重新发送此前的问题。" @click="(_event, done) => done(performAction(closeCustomerServiceSession, '接待已结束'))">结束接待</Button>
          <Button perm="CustomerService.read" icon="Refresh" link :disabled="busy" @click="(_event, done) => done(retryRefresh())">刷新</Button>
        </div>
      </header>
      <p v-if="pollingPaused" class="customer-conversation__notice" role="status">消息自动刷新已暂停，请点击刷新重试；未发送内容已保留。</p>
      <div ref="messageContainer" class="customer-conversation__messages" role="log" aria-label="会话消息">
        <div v-if="hasMoreMessages" class="customer-conversation__history">
          <Button perm="CustomerService.read" link :loading="loadingOlder" :auto-icon="false" @click="(_event, done) => done(loadOlderMessages())">加载更早消息</Button>
        </div>
        <el-empty v-if="detail && !detail.messages.length" description="暂无聊天消息" :image-size="65" />
        <article v-for="message in detail?.messages || []" :key="message.id" class="customer-conversation__message" :class="`customer-conversation__message--${message.role}`">
          <div class="customer-conversation__meta">{{ roleName(message) }} · {{ formatDateTime(message.createdAt) }}</div>
          <div class="customer-conversation__content">{{ message.content }}</div>
        </article>
        <article v-if="detail?.activeTask?.answer && !detail.messages.some(message => message.role === 'ai' && message.taskId === detail?.activeTask?.id)" class="customer-conversation__message customer-conversation__message--ai">
          <div class="customer-conversation__meta">AI 客服 · {{ detail.activeTask.status === 'cancelling' ? '正在停止' : '正在回答' }}</div>
          <div class="customer-conversation__content">{{ detail.activeTask.answer }}</div>
        </article>
      </div>
      <footer class="customer-conversation__composer" @keydown="handleComposerKeydown">
        <p v-if="detail?.serviceStatus === 'human' && !isMine" class="customer-conversation__notice">此会话由 {{ detail.assignedAgentName || '其他客服' }} 接待，当前仅可查看。</p>
        <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="0px" />
        <div class="customer-conversation__send">
          <span>纯文本消息，最多 10000 字</span>
          <Button perm="CustomerService.create" :auto-icon="false" :disabled="!canSend || !form.content.trim()" :loading="busy" @click="(_event, done) => done(sendMessage())">发送回复</Button>
        </div>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.customer-conversation { min-width: 0; border: 1px solid var(--el-border-color); border-radius: 6px; overflow: hidden; }
.customer-conversation__header { display: flex; justify-content: space-between; gap: 12px; padding: 16px; border-bottom: 1px solid var(--el-border-color-lighter); }
.customer-conversation__header h3 { margin: 0; font-size: 16px; word-break: break-word; }
.customer-conversation__header p, .customer-conversation__notice { margin: 8px 0; color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.6; }
.customer-conversation > .customer-conversation__notice { padding: 0 16px; }
.customer-conversation__actions { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
.customer-conversation__actions :deep(.el-button) { margin-left: 0; }
.customer-conversation__messages { height: min(53vh, 620px); min-height: 280px; overflow-y: auto; padding: 16px; background: var(--el-fill-color-lighter); }
.customer-conversation__history { text-align: center; margin-bottom: 12px; }
.customer-conversation__message { margin-bottom: 16px; max-width: 92%; }
.customer-conversation__message--agent { margin-left: auto; }
.customer-conversation__meta { color: var(--el-text-color-secondary); font-size: 12px; margin-bottom: 6px; }
.customer-conversation__message--agent .customer-conversation__meta { text-align: right; }
.customer-conversation__content { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 10px 12px; font-size: 14px; line-height: 1.7; }
.customer-conversation__message--agent .customer-conversation__content { background: var(--el-color-primary-light-9); }
.customer-conversation__message--system { max-width: 100%; }
.customer-conversation__message--system .customer-conversation__content { color: var(--el-text-color-secondary); font-size: 12px; background: transparent; border: 0; padding: 0; }
.customer-conversation__composer { padding: 16px; border-top: 1px solid var(--el-border-color-lighter); }
.customer-conversation__composer :deep(.el-form-item__label) { display: none; }
.customer-conversation__send { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.customer-conversation__send span { color: var(--el-text-color-secondary); font-size: 12px; }
</style>
