<script setup lang="ts">
/**
 * PageContainer — 页面内容容器。
 *
 * 核心能力：
 * - 统一业务页面白底、圆角和内边距
 * - 默认 slot 承载页面主体，`#extra` 放置页面级右上角工具区
 * - 标题主要由 MainLayout 顶部横条承载，title 保留给兼容和未来扩展
 */
defineProps<{
  title?: string;
}>();
</script>

<template>
  <div class="page-container">
    <div v-if="$slots.extra" class="page-container__toolbar">
      <div class="page-container__extra">
        <slot name="extra" />
      </div>
    </div>
    <div class="page-container__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.page-container {
  background: #fff;
  border-radius: 4px;
  padding: 16px;
}
.page-container__toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 16px;
}
</style>
