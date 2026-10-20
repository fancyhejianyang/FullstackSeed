<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import Dialog from "@/components/Dialog.vue";
import Button from "@/components/Button.vue";
import { formatDateTime } from "@/utils/format";
import { getComfyTask, type ComfyTask } from "@/api/comfyUi";

const props = defineProps<{ taskId: number | null }>();
const visible = defineModel<boolean>("visible", { required: true });
const loading = ref(false);
const task = ref<ComfyTask | null>(null);
let timer: number | undefined;
let requestId = 0;
const activeStatuses = new Set([
  "pending",
  "submitting",
  "queued",
  "running",
  "archiving",
]);
function stopPolling() {
  if (timer) window.clearTimeout(timer);
  timer = undefined;
}
async function loadTask(id: number, background = false) {
  const currentRequest = ++requestId;
  if (!background) loading.value = true;
  try {
    const result = await getComfyTask(id);
    if (currentRequest !== requestId || !visible.value || props.taskId !== id)
      return;
    task.value = result;
    stopPolling();
    if (activeStatuses.has(result.status)) {
      timer = window.setTimeout(() => void loadTask(id, true), 3000);
    }
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
}
watch(
  () => [visible.value, props.taskId] as const,
  async ([open, id]) => {
    if (!open || !id) {
      stopPolling();
      requestId += 1;
      task.value = null;
      return;
    }
    stopPolling();
    task.value = null;
    await loadTask(id);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  stopPolling();
  requestId += 1;
});
function pretty(value?: Record<string, unknown>) {
  return JSON.stringify(value || {}, null, 2);
}
</script>

<template>
  <Dialog
    v-model="visible"
    title="ComfyUI 任务详情"
    width="900px"
    :show-footer="false"
  >
    <div v-loading="loading" class="task-detail">
      <template v-if="task">
        <div class="summary-grid">
          <span>任务</span><strong>#{{ task.id }}</strong> <span>工作流</span
          ><strong>{{ task.workflowName }}</strong> <span>当前状态</span
          ><strong>{{ task.stage }}</strong> <span>提交时间</span
          ><strong>{{ formatDateTime(task.createdAt) }}</strong>
          <span>Prompt ID</span
          ><strong>{{ task.promptId || "尚未提交" }}</strong>
        </div>
        <el-alert
          v-if="task.errorMessage"
          :title="task.errorMessage"
          type="warning"
          :closable="false"
          show-icon
        />
        <section>
          <h3>提交参数</h3>
          <pre>{{ pretty(task.parameterSnapshot) }}</pre>
        </section>
        <section>
          <h3>生成结果</h3>
          <el-empty
            v-if="!task.outputs?.length"
            description="当前没有已归档结果"
          />
          <div v-else class="output-grid">
            <article v-for="output in task.outputs" :key="output.id">
              <img
                v-if="output.mimeType.startsWith('image/')"
                :src="output.fileUrl"
                :alt="output.fileName"
              />
              <video
                v-else-if="output.mimeType.startsWith('video/')"
                :src="output.fileUrl"
                controls
                preload="metadata"
              />
              <div v-else class="file-placeholder">文件</div>
              <div class="output-meta">
                <span>{{ output.fileName }}</span>
                <Button
                  link
                  :confirm="false"
                  :auto-type="false"
                  :auto-icon="false"
                >
                  <a
                    :href="output.fileUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    >打开</a
                  >
                </Button>
              </div>
            </article>
          </div>
        </section>
        <div class="footer"><Button @click="visible = false">关闭</Button></div>
      </template>
    </div>
  </Dialog>
</template>

<style scoped>
.task-detail {
  min-height: 180px;
}
.summary-grid {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  gap: 10px 16px;
  margin-bottom: 18px;
}
.summary-grid span {
  color: #909399;
}
.summary-grid strong {
  font-weight: 500;
  overflow-wrap: anywhere;
}
section {
  margin-top: 22px;
}
section h3 {
  margin: 0 0 12px;
  font-size: 15px;
}
pre {
  margin: 0;
  padding: 14px;
  background: #f5f7fa;
  border-radius: 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.output-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}
.output-grid article {
  border: 1px solid #dcdfe6;
  border-radius: 9px;
  overflow: hidden;
  background: #fff;
}
.output-grid img,
.output-grid video,
.file-placeholder {
  width: 100%;
  height: 180px;
  object-fit: contain;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
}
.output-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 10px;
}
.output-meta span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.output-meta a {
  color: inherit;
  text-decoration: none;
}
.footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
