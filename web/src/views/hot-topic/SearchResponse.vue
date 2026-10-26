<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import Dialog from '@/components/Dialog.vue';
import Button from '@/components/Button.vue';
import { formatDateTime } from '@/utils/format';
import { modelPlatformLabels, type ModelPlatform } from '@/utils/modelPlatform';
import {
  getHotRunSearchResponse,
  type HotSearchDiagnostics,
} from '@/api/hotTopicDiagnostics';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{
  runId: number | null;
  sourceIndex: number | null;
  sourceName?: string;
}>();
const detail = ref<HotSearchDiagnostics | null>(null);
const loading = ref(false);
const failed = ref(false);
let sequence = 0;
const parsingLabels = {
  succeeded: '已核验搜索来源',
  failed: '未通过来源核验',
  notAttempted: '未进入来源解析',
};

function clear() {
  ++sequence;
  detail.value = null;
  failed.value = false;
  loading.value = false;
}

async function load() {
  clear();
  const runId = props.runId;
  const sourceIndex = props.sourceIndex;
  if (
    !visible.value ||
    runId == null ||
    sourceIndex == null ||
    !Number.isInteger(runId) ||
    runId <= 0 ||
    !Number.isInteger(sourceIndex) ||
    sourceIndex < 0
  )
    return;
  const current = sequence;
  loading.value = true;
  const isCurrent = () =>
    visible.value &&
    sequence === current &&
    props.runId === runId &&
    props.sourceIndex === sourceIndex;
  try {
    const result = await getHotRunSearchResponse(runId, sourceIndex);
    if (isCurrent()) detail.value = result;
  } catch {
    if (isCurrent()) failed.value = true;
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

watch(
  () => [visible.value, props.runId, props.sourceIndex] as const,
  ([open]) => {
    if (open) void load();
    else clear();
  },
  { immediate: true, flush: 'sync' },
);
onBeforeUnmount(clear);
</script>

<template>
  <Dialog
    v-model="visible"
    title="查看联网响应"
    width="940px"
    :show-footer="false"
  >
    <div v-loading="loading" class="search-response">
      <p class="hint">
        任务 #{{ props.runId }} · {{ props.sourceName || '联网搜索' }}。
        以下为本次调用保存的脱敏信息，查看和重新读取不会再次调用模型。
        一次搜索可能覆盖多个来源；此处显示解析到的全部来源数量，各来源收录数量见任务记录。
      </p>
      <p v-if="failed" class="error">
        联网响应读取失败，记录可能尚未保存或已不可用。
        <Button perm="HotTopic.read" :confirm="false" @click="load"
          >重新读取</Button
        >
      </p>
      <template v-else-if="detail">
        <el-descriptions
          :column="1"
          border
          class="descriptions-label-nowrap"
          style="--descriptions-label-width: 112px"
        >
          <el-descriptions-item label="平台">{{
            modelPlatformLabels[detail.platformType as ModelPlatform] ||
            detail.platformType
          }}</el-descriptions-item>
          <el-descriptions-item label="账号编号">{{
            detail.providerId
          }}</el-descriptions-item>
          <el-descriptions-item label="模型">{{
            detail.model
          }}</el-descriptions-item>
          <el-descriptions-item label="协议">{{
            detail.protocol
          }}</el-descriptions-item>
          <el-descriptions-item label="调用路径">{{
            detail.apiPath
          }}</el-descriptions-item>
          <el-descriptions-item label="HTTP 状态">{{
            detail.httpStatus ?? '未收到响应'
          }}</el-descriptions-item>
          <el-descriptions-item label="耗时"
            >{{
              (detail.elapsedMilliseconds / 1000).toFixed(2)
            }}
            秒</el-descriptions-item
          >
          <el-descriptions-item label="记录时间">{{
            formatDateTime(detail.checkedAt)
          }}</el-descriptions-item>
          <el-descriptions-item label="解析结果">{{
            parsingLabels[detail.parsing.status]
          }}</el-descriptions-item>
          <el-descriptions-item label="解析来源"
            >{{ detail.parsing.sourceCount }} 条</el-descriptions-item
          >
          <el-descriptions-item v-if="detail.parsing.code" label="原因编码">{{
            detail.parsing.code
          }}</el-descriptions-item>
          <el-descriptions-item label="核验说明">{{
            detail.parsing.message || '暂无说明'
          }}</el-descriptions-item>
        </el-descriptions>
        <h3>接口返回内容</h3>
        <p v-if="detail.truncated" class="hint">
          返回内容已省略大字段或截断展示；以下文本不代表完整响应。
        </p>
        <pre class="response-body">{{
          detail.responseBody ||
          '本次未保存响应正文，请结合 HTTP 状态和核验说明判断。'
        }}</pre>
      </template>
      <p v-else-if="loading" class="hint">正在读取已保存的联网响应…</p>
    </div>
    <template #footer>
      <Button :confirm="false" @click="visible = false">关闭</Button>
    </template>
  </Dialog>
</template>

<style scoped>
.search-response {
  min-height: 100px;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.error {
  color: var(--el-color-danger);
}
h3 {
  margin: 20px 0 8px;
  font-size: 15px;
}
.response-body {
  max-height: 400px;
  overflow: auto;
  margin: 0;
  padding: 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-light);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: Consolas, monospace;
  font-size: 12px;
}
</style>
