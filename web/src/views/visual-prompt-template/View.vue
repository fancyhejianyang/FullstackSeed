<script setup lang="ts">
import { ref, watch } from "vue";
import Dialog from "@/components/Dialog.vue";
import {
  getVisualPromptTemplate,
  type VisualPromptTemplate,
  type VisualPromptTemplateSummary,
} from "@/api/visualPromptTemplate";
const props = defineProps<{ row?: VisualPromptTemplateSummary | null }>();
const visible = defineModel<boolean>("visible", { required: true });
const loading = ref(false);
const detail = ref<VisualPromptTemplate | null>(null);
watch(visible, async (open) => {
  if (!open || !props.row) return;
  loading.value = true;
  try {
    detail.value = await getVisualPromptTemplate(props.row.id);
  } finally {
    loading.value = false;
  }
});
</script>
<template>
  <Dialog
    v-model="visible"
    title="视觉提示词模板"
    width="860px"
    :show-footer="false"
  >
    <div v-loading="loading" class="prompt-view">
      <template v-if="detail">
        <div class="prompt-view__meta">
          <strong>{{ detail.name }}</strong>
          <el-tag>{{ detail.mediaType === "video" ? "视频" : "图片" }}</el-tag>
          <span>模型：{{ detail.targetModel || "通用" }}</span>
          <span>v{{ detail.version }}</span>
        </div>
        <section>
          <h4>风格摘要</h4>
          <p>{{ detail.styleSummary || "尚未提炼" }}</p>
        </section>
        <section>
          <h4>模型规则</h4>
          <pre>{{ detail.modelRules || "尚未配置" }}</pre>
        </section>
        <section>
          <h4>正向模板</h4>
          <pre>{{ detail.positiveTemplate || detail.sourcePrompt }}</pre>
        </section>
        <section>
          <h4>负向模板</h4>
          <pre>{{
            detail.negativeTemplate ||
            detail.sourceNegativePrompt ||
            "该模板未配置负向提示词"
          }}</pre>
        </section>
      </template>
    </div>
  </Dialog>
</template>
<style scoped>
.prompt-view {
  display: grid;
  gap: 14px;
}
.prompt-view__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-text-secondary);
}
.prompt-view__meta strong {
  margin-right: auto;
  color: var(--color-text-primary);
  font-size: var(--font-size-lg);
}
section {
  padding: 14px 16px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  background: #fafcff;
}
h4,
p,
pre {
  margin: 0;
}
h4 {
  margin-bottom: 8px;
  color: var(--color-text-primary);
}
p,
pre {
  color: var(--color-text-regular);
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
}
</style>
