<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import Button from "@/components/Button.vue";
import { getPermissionActionColor } from "@/utils/permission";
import { getAgentImage, type AgentImageReference } from "@/api/agentWorkspace";

const props = defineProps<{ sessionId: number; image: AgentImageReference }>();
const url = ref("");
const error = ref(false);
const loading = ref(false);
let version = 0;
function release() {
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = "";
}
async function load() {
  const current = ++version;
  release();
  error.value = false;
  loading.value = true;
  try {
    const blob = await getAgentImage(props.sessionId, props.image.id);
    if (current !== version) return;
    url.value = URL.createObjectURL(blob);
  } catch {
    if (current === version) error.value = true;
  } finally {
    if (current === version) loading.value = false;
  }
}
watch(
  () => [props.sessionId, props.image.id],
  () => void load(),
  { immediate: true },
);
onUnmounted(() => {
  version += 1;
  release();
});
</script>

<template>
  <div class="agent-image" v-loading="loading">
    <el-image
      v-if="url"
      :src="url"
      :preview-src-list="[url]"
      preview-teleported
      fit="contain"
      :alt="image.source === 'generated' ? 'AI 生成图片' : '用户上传图片'"
    />
    <Button
      v-else-if="error"
      link
      :type="getPermissionActionColor('read')"
      :confirm="false"
      @click="load"
      >图片加载失败，点击重试</Button
    >
    <span v-else>正在加载图片…</span>
  </div>
</template>

<style scoped>
.agent-image {
  width: min(360px, 100%);
  min-height: 80px;
  margin-top: 10px;
}
.agent-image :deep(.el-image) {
  max-width: 100%;
  max-height: 360px;
  border-radius: 10px;
}
</style>
