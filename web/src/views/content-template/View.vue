<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import Dialog from '@/components/Dialog.vue';
import Button from '@/components/Button.vue';
import {
  getContentTemplate,
  type ContentTemplate,
  type ContentTemplateSummary,
} from '@/api/contentTemplate';

const props = defineProps<{ row?: ContentTemplateSummary | null }>();
const visible = defineModel<boolean>('visible', { required: true });
const detail = ref<ContentTemplate | null>(null);
const loading = ref(false);
let epoch = 0;
watch(
  () => [visible.value, props.row?.id] as const,
  async ([open, id]) => {
    const current = ++epoch;
    detail.value = null;
    loading.value = false;
    if (!open || !id) return;
    loading.value = true;
    try {
      const result = await getContentTemplate(id);
      if (current === epoch) detail.value = result;
    } catch {
      /* 请求层提示错误。 */
    } finally {
      if (current === epoch) loading.value = false;
    }
  },
);
onBeforeUnmount(() => {
  ++epoch;
});
</script>
<template>
  <Dialog
    v-model="visible"
    title="查看模板"
    width="min(760px, 94vw)"
    :show-footer="false"
  >
    <div v-loading="loading">
      <el-descriptions v-if="detail" :column="1" border>
        <el-descriptions-item label="模板名称">{{
          detail.name
        }}</el-descriptions-item>
        <el-descriptions-item label="写作要求">
          <pre>{{ detail.instruction }}</pre>
        </el-descriptions-item>
      </el-descriptions>
      <el-empty v-else-if="!loading" description="模板读取失败" />
    </div>
    <template #footer><Button @click="visible = false">关闭</Button></template>
  </Dialog>
</template>
<style scoped>
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  line-height: 1.8;
  margin: 0;
}
</style>
