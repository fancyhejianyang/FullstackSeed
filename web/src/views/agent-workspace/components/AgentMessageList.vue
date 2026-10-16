<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { ProductOption } from "@/api/productCatalog";
import type {
  AgentDraft,
  AgentExecution,
  AgentMessage,
} from "@/api/agentWorkspace";
import AgentDraftCard from "./AgentDraftCard.vue";
import AgentExecutionStatus from "./AgentExecutionStatus.vue";
import AgentQueryCard from "./AgentQueryCard.vue";
import AgentBusinessQueryCard from "./AgentBusinessQueryCard.vue";
import AgentProcessingIndicator from "./AgentProcessingIndicator.vue";

const props = defineProps<{
  agentName: string;
  responsibility: string;
  suggestions: Array<{
    kind: "chat" | "knowledge" | "query" | "write";
    title: string;
    description: string;
    prompt: string;
  }>;
  messages: AgentMessage[];
  drafts: AgentDraft[];
  executions: AgentExecution[];
  products: ProductOption[];
  busy?: boolean;
  processing?: {
    clientMessageId: string;
    text: string;
    startedAt: string;
  } | null;
}>();
const emit = defineEmits<{
  updateDraft: [draft: AgentDraft, data: AgentDraft["data"]];
  confirmDraft: [draft: AgentDraft];
  cancelDraft: [draft: AgentDraft];
  prompt: [prompt: string];
}>();
const scroller = ref<HTMLElement>();

const draftMap = computed(
  () => new Map(props.drafts.map((item) => [item.id, item])),
);
const executionMap = computed(
  () => new Map(props.executions.map((item) => [item.id, item])),
);
const latestDraftMessageMap = computed(() => {
  const result = new Map<number, number>();
  props.messages.forEach((message) => {
    const draftId = message.structuredData?.draftId;
    if (draftId) result.set(draftId, message.id);
  });
  return result;
});

function draftFor(message: AgentMessage) {
  const id = message.structuredData?.draftId;
  return id ? draftMap.value.get(id) : undefined;
}
function executionFor(message: AgentMessage) {
  return message.executionId
    ? executionMap.value.get(message.executionId)
    : undefined;
}
function showDraftCard(message: AgentMessage) {
  const id = message.structuredData?.draftId;
  return Boolean(id && latestDraftMessageMap.value.get(id) === message.id);
}

function forwardDraftUpdate(draft: AgentDraft, data: AgentDraft["data"]) {
  emit("updateDraft", draft, data);
}

watch(
  () => [
    props.messages[props.messages.length - 1]?.id ?? 0,
    props.drafts.map((item) => item.version).join(","),
    props.processing?.clientMessageId,
  ],
  async () => {
    await nextTick();
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
  },
  { immediate: true },
);
</script>

<template>
  <div ref="scroller" class="message-list">
    <div v-if="!messages.length" class="message-list__welcome">
      <div class="message-list__welcome-avatar">
        <el-icon><MagicStick /></el-icon>
      </div>
      <h2>你好，我是 {{ agentName }}</h2>
      <p>{{ responsibility || "很高兴为你提供帮助，有什么想聊的？" }}</p>
      <div class="message-list__suggestions">
        <button
          v-for="item in suggestions"
          :key="`${item.kind}:${item.prompt}`"
          type="button"
          :disabled="busy"
          @click="emit('prompt', item.prompt)"
        >
          <span class="message-list__suggestion-icon">
            <el-icon v-if="item.kind === 'knowledge'"><Collection /></el-icon>
            <el-icon v-else-if="item.kind === 'query'"><Search /></el-icon>
            <el-icon v-else-if="item.kind === 'write'"><EditPen /></el-icon>
            <el-icon v-else><ChatLineRound /></el-icon>
          </span>
          <span>
            <strong>{{ item.title }}</strong>
            <small>{{ item.description }}</small>
          </span>
          <el-icon class="message-list__suggestion-arrow">
            <ArrowRight />
          </el-icon>
        </button>
      </div>
    </div>
    <div v-else class="message-list__content">
      <template v-for="message in messages" :key="message.id">
        <div class="message-list__item" :class="`is-${message.role}`">
          <div class="message-list__role">
            <el-icon v-if="message.role === 'user'"><UserFilled /></el-icon>
            <el-icon v-else><MagicStick /></el-icon>
          </div>
          <div class="message-list__body">
            <div class="message-list__author">
              {{ message.role === "user" ? "我" : agentName }}
            </div>
            <template v-if="showDraftCard(message) && draftFor(message)">
              <div
                v-if="message.messageType === 'draft' && message.content"
                class="message-list__bubble"
              >
                {{ message.content }}
              </div>
              <AgentDraftCard
                :draft="draftFor(message)!"
                :products="products"
                :busy="busy"
                @update="forwardDraftUpdate"
                @confirm="emit('confirmDraft', $event)"
                @cancel="emit('cancelDraft', $event)"
              />
            </template>
            <AgentBusinessQueryCard
              v-else-if="message.structuredData?.businessResult"
              :result="message.structuredData.businessResult"
            />
            <AgentQueryCard
              v-else-if="message.messageType === 'query_result'"
              :context="message.structuredData?.context"
              :detail-path="message.structuredData?.detailPath"
            />
            <div
              v-else
              class="message-list__bubble"
              :class="{ 'is-error': message.messageType === 'error' }"
            >
              {{ message.content }}
              <div
                v-if="message.structuredData?.sourceNames"
                class="message-list__sources"
              >
                <el-icon><Document /></el-icon>
                来源：{{ message.structuredData.sourceNames }}
              </div>
            </div>
            <AgentExecutionStatus
              v-if="message.role !== 'user' && executionFor(message)"
              class="message-list__status"
              :status="executionFor(message)!.status"
              :tool-key="executionFor(message)!.toolKey"
              :result="executionFor(message)!.result"
              :error-message="executionFor(message)!.errorMessage"
            />
          </div>
        </div>
        <div
          v-if="
            processing &&
            message.role === 'user' &&
            message.clientMessageId === processing.clientMessageId
          "
          class="message-list__item is-assistant"
        >
          <div class="message-list__role">
            <el-icon><MagicStick /></el-icon>
          </div>
          <div class="message-list__body">
            <div class="message-list__author">{{ agentName }}</div>
            <AgentProcessingIndicator
              :text="processing.text"
              :started-at="processing.startedAt"
            />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.message-list {
  height: 100%;
  overflow-y: auto;
  scroll-behavior: smooth;
  background: #fff;
}
.message-list__welcome {
  display: flex;
  width: min(820px, calc(100% - 48px));
  min-height: 100%;
  margin: 0 auto;
  padding: 54px 0 32px;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}
.message-list__welcome-avatar {
  display: grid;
  width: 64px;
  height: 64px;
  margin-bottom: 20px;
  place-items: center;
  color: #fff;
  font-size: 27px;
  border-radius: 22px;
  background: linear-gradient(145deg, #79bbff, #409eff);
  box-shadow: 0 12px 30px rgb(64 158 255 / 25%);
}
.message-list__welcome h2 {
  margin: 0;
  color: #1f2329;
  font-size: 26px;
  font-weight: 650;
  letter-spacing: -0.4px;
}
.message-list__welcome > p {
  max-width: 620px;
  margin: 12px 0 30px;
  color: #7d828a;
  font-size: 14px;
  line-height: 1.7;
}
.message-list__suggestions {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.message-list__suggestions button {
  display: grid;
  min-width: 0;
  min-height: 76px;
  padding: 14px 15px;
  align-items: center;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  text-align: left;
  border: 1px solid #ebeef3;
  border-radius: 14px;
  background: #fafbfc;
  cursor: pointer;
  transition:
    border-color 0.2s,
    background-color 0.2s,
    box-shadow 0.2s,
    transform 0.2s;
}
.message-list__suggestions button:hover:not(:disabled) {
  border-color: #c6e2ff;
  background: #fff;
  box-shadow: 0 8px 20px rgb(31 35 41 / 8%);
  transform: translateY(-1px);
}
.message-list__suggestions button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.message-list__suggestion-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  color: #409eff;
  font-size: 17px;
  border-radius: 11px;
  background: #ecf5ff;
}
.message-list__suggestions button > span:nth-child(2) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}
.message-list__suggestions strong {
  color: #303133;
  font-size: 13px;
}
.message-list__suggestions small {
  overflow: hidden;
  color: #909399;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.message-list__suggestion-arrow {
  color: #c0c4cc;
}
.message-list__content {
  width: min(880px, calc(100% - 48px));
  margin: 0 auto;
  padding: 32px 0 120px;
}
.message-list__item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 28px;
}
.message-list__item.is-user {
  flex-direction: row-reverse;
}
.message-list__role {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  color: #fff;
  font-size: 16px;
  border-radius: 12px;
  background: linear-gradient(145deg, #79bbff, #409eff);
}
.message-list__item.is-user .message-list__role {
  color: #606266;
  background: #f0f2f5;
}
.message-list__body {
  max-width: min(760px, calc(100% - 56px));
}
.message-list__item.is-user .message-list__body {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
}
.message-list__author {
  margin: 0 0 7px 2px;
  color: #8f959e;
  font-size: 12px;
  font-weight: 500;
}
.message-list__bubble {
  padding: 3px 2px;
  color: #1f2329;
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}
.message-list__item.is-user .message-list__bubble {
  padding: 10px 14px;
  color: #303133;
  line-height: 1.65;
  border-radius: 16px 16px 4px;
  background: #edf5ff;
}
.message-list__bubble.is-error {
  padding: 10px 12px;
  color: #f56c6c;
  border: 1px solid #fab6b6;
  border-radius: 10px;
  background: #fef0f0;
}
.message-list__sources {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
}
.message-list__status {
  margin-top: 8px;
}
@media (max-width: 720px) {
  .message-list__welcome,
  .message-list__content {
    width: min(100% - 28px, 880px);
  }
  .message-list__welcome {
    padding-top: 36px;
    justify-content: flex-start;
  }
  .message-list__suggestions {
    grid-template-columns: 1fr;
  }
  .message-list__welcome h2 {
    font-size: 22px;
  }
}
</style>
