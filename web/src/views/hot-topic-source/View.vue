<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import Dialog from '@/components/Dialog.vue';
import Button from '@/components/Button.vue';
import {
  getHotSource,
  sourceKindLabels,
  sourceAccessLabels,
  safeSourceUrl,
  type HotSource,
} from '@/api/hotTopic';
const props = defineProps<{ row: HotSource | null }>();
const visible = defineModel<boolean>('visible', { required: true });
const detail = ref<HotSource | null>(null);
const loading = ref(false),
  failed = ref(false);
let epoch = 0;
async function load() {
  const sequence = ++epoch;
  detail.value = null;
  failed.value = false;
  if (!props.row) return;
  loading.value = true;
  try {
    const result = await getHotSource(props.row.id);
    if (sequence === epoch && visible.value) detail.value = result;
  } catch {
    if (sequence === epoch) failed.value = true;
  } finally {
    if (sequence === epoch) loading.value = false;
  }
}
watch(
  () => [visible.value, props.row?.id] as const,
  ([open]) => {
    if (open) void load();
    else {
      ++epoch;
      detail.value = null;
    }
  },
);
onBeforeUnmount(() => ++epoch);
</script>
<template>
  <Dialog
    v-model="visible"
    title="热点来源详情"
    width="720px"
    :show-footer="false"
  >
    <div v-loading="loading" class="source-detail">
      <el-empty v-if="failed" description="来源读取失败"
        ><Button @click="load">重新读取</Button></el-empty
      >
      <el-descriptions v-else-if="detail" :column="1" border>
        <el-descriptions-item label="名称">{{
          detail.name
        }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{
          sourceKindLabels[detail.kind]
        }}</el-descriptions-item>
        <el-descriptions-item label="获取方式">{{
          sourceAccessLabels[detail.accessMode]
        }}</el-descriptions-item>
        <el-descriptions-item label="地址"
          ><a
            v-if="safeSourceUrl(detail.url)"
            :href="safeSourceUrl(detail.url)"
            target="_blank"
            rel="noopener noreferrer"
            >{{ detail.url }}</a
          ><span v-else>{{ detail.url }}</span></el-descriptions-item
        >
        <el-descriptions-item label="启用状态">{{
          detail.isEnabled ? '已启用' : '已停用'
        }}</el-descriptions-item>
        <el-descriptions-item label="说明">{{
          detail.description || '—'
        }}</el-descriptions-item>
      </el-descriptions>
    </div>
    <template #footer><Button @click="visible = false">关闭</Button></template>
  </Dialog>
</template>
<style scoped>
.source-detail {
  min-height: 100px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
a {
  color: var(--el-color-primary);
}
</style>
