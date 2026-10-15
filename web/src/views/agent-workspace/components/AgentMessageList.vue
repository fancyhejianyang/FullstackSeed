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

const props = defineProps<{
  messages: AgentMessage[];
  drafts: AgentDraft[];
  executions: AgentExecution[];
  products: ProductOption[];
  busy?: boolean;
}>();
const emit = defineEmits<{
  updateDraft: [draft: AgentDraft, data: AgentDraft["data"]];
  confirmDraft: [draft: AgentDraft];
  cancelDraft: [draft: AgentDraft];
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
    props.messages.length,
    props.drafts.map((item) => item.version).join(","),
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
    <el-empty v-if="!messages.length" description="开始一段新的 Agent 对话" />
    <div
      v-for="message in messages"
      :key="message.id"
      class="message-list__item"
      :class="`is-${message.role}`"
    >
      <div class="message-list__role">
        {{ message.role === "user" ? "我" : "Agent" }}
      </div>
      <div class="message-list__body">
        <AgentDraftCard
          v-if="showDraftCard(message) && draftFor(message)"
          :draft="draftFor(message)!"
          :products="products"
          :busy="busy"
          @update="forwardDraftUpdate"
          @confirm="emit('confirmDraft', $event)"
          @cancel="emit('cancelDraft', $event)"
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
            来源：{{ message.structuredData.sourceNames }}
          </div>
        </div>
        <AgentExecutionStatus
          v-if="executionFor(message)"
          class="message-list__status"
          :status="executionFor(message)!.status"
          :error-message="executionFor(message)!.errorMessage"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-list {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  background: #f7f8fa;
}
.message-list__item {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
}
.message-list__item.is-user {
  flex-direction: row-reverse;
}
.message-list__role {
  flex: 0 0 auto;
  width: 42px;
  height: 32px;
  line-height: 32px;
  text-align: center;
  color: #fff;
  font-size: 12px;
  border-radius: 16px;
  background: #304156;
}
.message-list__item.is-user .message-list__role {
  background: #409eff;
}
.message-list__body {
  max-width: min(760px, calc(100% - 60px));
}
.message-list__bubble {
  padding: 12px 14px;
  color: #303133;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  background: #fff;
}
.message-list__item.is-user .message-list__bubble {
  color: #fff;
  border-color: #409eff;
  background: #409eff;
}
.message-list__bubble.is-error {
  color: #f56c6c;
  border-color: #fab6b6;
  background: #fef0f0;
}
.message-list__sources {
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
}
.message-list__status {
  margin-top: 6px;
}
</style>
