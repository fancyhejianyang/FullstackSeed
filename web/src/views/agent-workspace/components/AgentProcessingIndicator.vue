<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps<{ text: string; startedAt: string }>();
const now = ref(Date.now());
const elapsed = computed(
  () =>
    Math.max(0, Math.floor((now.value - Date.parse(props.startedAt)) / 1000)) ||
    0,
);
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="agent-processing">
    <span class="agent-processing__dots" aria-hidden="true"
      ><i /><i /><i
    /></span>
    <span role="status" aria-live="polite" aria-atomic="true">{{ text }}</span>
    <span
      v-if="elapsed > 0"
      class="agent-processing__elapsed"
      aria-hidden="true"
      >{{ elapsed }} 秒</span
    >
  </div>
</template>

<style scoped>
.agent-processing {
  display: flex;
  min-height: 28px;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.8;
}
.agent-processing__dots {
  display: flex;
  gap: 4px;
}
.agent-processing__dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--el-color-primary);
  animation: agent-processing-pulse 1.4s ease-in-out infinite;
}
.agent-processing__dots i:nth-child(2) {
  animation-delay: 0.16s;
}
.agent-processing__dots i:nth-child(3) {
  animation-delay: 0.32s;
}
.agent-processing__elapsed {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
@keyframes agent-processing-pulse {
  0%,
  80%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .agent-processing__dots i {
    animation: none;
  }
}
</style>
