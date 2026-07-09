<script setup lang="ts">
/**
 * PageContainer 页面容器（二次封装示例）
 * 统一业务页面的标题区与内容内边距，新组件可参照此模式封装。
 */
defineProps<{
  title?: string;
}>();
</script>

<template>
  <div class="page-container">
    <div v-if="title || $slots.extra" class="page-container__header">
      <span class="page-container__title">{{ title }}</span>
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
.page-container__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-container__title {
  font-size: 16px;
  font-weight: 600;
}
</style>
