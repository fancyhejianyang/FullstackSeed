<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "@/components/Button.vue";
import { getAgentApp, type AgentApp } from "@/api/agentApp";
import type { AgentExecution, AvailableAgentApp } from "@/api/agentWorkspace";
import { formatDateTime } from "@/utils/format";
import RecordView from "@/views/agent-app/RecordView.vue";
import { toolLabel } from "@/views/agent-app/executionRecord";
import AgentExecutionStatus from "./AgentExecutionStatus.vue";

const props = defineProps<{
  app: AvailableAgentApp;
  executions: AgentExecution[];
  revision: number;
  busy: boolean;
}>();
const emit = defineEmits<{ refresh: [] }>();
const config = ref<AgentApp | null>(null);
const loading = ref(false);
const failed = ref(false);
const viewVisible = ref(false);
const selectedExecution = ref<{ id: number } | null>(null);

watch(
  [() => props.app.id, () => props.revision],
  async ([id], _previous, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    config.value = null;
    failed.value = false;
    viewVisible.value = false;
    selectedExecution.value = null;
    loading.value = true;
    try {
      const result = await getAgentApp(id);
      if (current) config.value = result;
    } catch {
      if (current) failed.value = true;
    } finally {
      if (current) loading.value = false;
    }
  },
  { immediate: true },
);

const strategyLabel = computed(() => {
  const strategy = config.value?.modelRouting?.strategy;
  return strategy === "intent"
    ? "按意图与复杂度"
    : strategy === "balanced"
      ? "均衡使用"
      : "优先顺序";
});
const latestExecution = computed(() =>
  props.executions.reduce<AgentExecution | null>(
    (latest, execution) =>
      !latest || execution.id > latest.id ? execution : latest,
    null,
  ),
);

function openExecution() {
  if (!latestExecution.value) return;
  selectedExecution.value = { id: latestExecution.value.id };
  viewVisible.value = true;
}
</script>

<template>
  <section class="agent-debug-panel" aria-label="Agent 配置与执行检查">
    <div class="agent-debug-panel__heading">
      <h2>当前配置</h2>
      <Button
        perm="AgentApp.read"
        link
        icon="Refresh"
        :disabled="busy || loading"
        @click="emit('refresh')"
        >刷新</Button
      >
    </div>
    <div v-loading="loading" class="agent-debug-panel__config">
      <p v-if="failed" role="alert">配置读取失败，请刷新重试。</p>
      <template v-else-if="config">
        <h3>{{ config.name }}</h3>
        <dl>
          <dt>模型账号</dt>
          <dd>{{ config.providerName }}</dd>
          <dt>默认调度</dt>
          <dd>{{ strategyLabel }}</dd>
          <dt>文本模型</dt>
          <dd>
            <div v-for="model in config.models" :key="model">{{ model }}</div>
          </dd>
          <dt>图片识别</dt>
          <dd>{{ config.mediaModels?.vision?.model || "未配置" }}</dd>
          <dt>图片生成</dt>
          <dd>{{ config.mediaModels?.imageGeneration?.model || "未配置" }}</dd>
          <dt>业务写入</dt>
          <dd>
            {{ config.writeEnabled ? "已开启，仍需权限与确认" : "已关闭" }}
          </dd>
          <dt>保存时间</dt>
          <dd>{{ formatDateTime(config.updatedAt) }}</dd>
        </dl>
        <details>
          <summary>调度与执行限制</summary>
          <dl>
            <template v-if="config.modelRouting?.strategy === 'intent'">
              <dt>轻量模型</dt>
              <dd>
                {{ config.modelRouting.simpleModels.join("、") || "未配置" }}
              </dd>
              <dt>复杂模型</dt>
              <dd>
                {{ config.modelRouting.complexModels.join("、") || "未配置" }}
              </dd>
            </template>
            <dt>模型尝试上限</dt>
            <dd>{{ config.modelRouting?.maxAttempts ?? "默认" }}</dd>
            <dt>单次调用超时</dt>
            <dd>
              {{
                config.modelRouting
                  ? `${config.modelRouting.attemptTimeoutSeconds} 秒`
                  : "默认"
              }}
            </dd>
            <dt>模型冷却</dt>
            <dd>
              {{
                config.modelRouting
                  ? `${config.modelRouting.cooldownSeconds} 秒`
                  : "默认"
              }}
            </dd>
            <dt>工具调用上限</dt>
            <dd>{{ config.maxToolCalls }}</dd>
            <dt>执行超时</dt>
            <dd>{{ config.timeoutSeconds }} 秒</dd>
            <dt>并发上限</dt>
            <dd>{{ config.maxConcurrentRuns }}</dd>
          </dl>
        </details>
        <details>
          <summary>业务工具（{{ config.toolKeys.length }}）</summary>
          <ul>
            <li v-for="key in config.toolKeys" :key="key">
              {{
                app.tools.find((tool) => tool.commandKey === key)?.name || key
              }}
              <small v-if="!app.toolKeys.includes(key)"
                >（当前未开放执行）</small
              >
            </li>
          </ul>
          <p v-if="!config.toolKeys.length">未配置业务工具</p>
        </details>
        <details>
          <summary>工作指令</summary>
          <pre>{{ config.instructionMarkdown || "未配置" }}</pre>
        </details>
      </template>
    </div>
    <div class="agent-debug-panel__execution">
      <h2>最近执行</h2>
      <template v-if="latestExecution">
        <p>
          #{{ latestExecution.id }} · {{ toolLabel(latestExecution.toolKey) }}
        </p>
        <AgentExecutionStatus
          :status="latestExecution.status"
          :tool-key="latestExecution.toolKey"
          :result="latestExecution.result"
        />
        <Button
          perm="AgentApp.read"
          link
          :disabled="busy"
          @click="openExecution"
          >查看模型轨迹与执行详情</Button
        >
      </template>
      <p v-else>发送消息后可查看本会话的执行详情。</p>
    </div>
    <p class="agent-debug-panel__hint">
      此处为当前已保存配置，实际执行版本以执行详情为准。调试记录正常留存，不是无副作用沙盒。
    </p>
    <RecordView v-model:visible="viewVisible" :row="selectedExecution" />
  </section>
</template>

<style scoped>
.agent-debug-panel {
  min-width: 0;
  padding: 0 18px 20px;
  color: #303133;
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.agent-debug-panel__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
h2,
h3 {
  margin: 10px 0;
  font-size: 14px;
}
.agent-debug-panel__config {
  min-height: 60px;
}
dl {
  margin: 0 0 12px;
}
dt {
  margin-top: 8px;
  color: #606975;
}
dd {
  margin: 0;
  white-space: pre-wrap;
}
details {
  margin-top: 12px;
}
summary {
  cursor: pointer;
  font-weight: 600;
}
ul {
  margin: 8px 0;
  padding-left: 18px;
}
pre {
  max-height: 300px;
  overflow: auto;
  margin: 8px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
}
.agent-debug-panel__execution {
  margin-top: 16px;
  border-top: 1px solid #dcdfe6;
}
.agent-debug-panel__hint {
  color: #606975;
  margin-top: 16px;
}
.agent-debug-panel__execution :deep(.el-button > span) {
  white-space: normal;
  text-align: left;
}
</style>
