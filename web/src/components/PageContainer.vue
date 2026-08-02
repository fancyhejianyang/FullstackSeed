<script setup lang="ts">
/**
 * PageContainer 页面容器（二次封装示例）
 * 统一业务页面内容卡片与内边距；页面标题由 MainLayout 顶部横条承载。
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
