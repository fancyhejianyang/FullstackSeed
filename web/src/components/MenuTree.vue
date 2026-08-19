<script setup lang="ts">
/**
 * MenuTree — 侧边栏菜单树组件。
 *
 * 核心能力：
 * - 递归渲染后端下发的 MenuNode 树
 * - 有 children 渲染 el-sub-menu，叶子节点渲染 el-menu-item
 * - 只负责展示结构；路由跳转由外层 el-menu 的 router 属性接管
 */
import type { MenuNode } from '@/api/menu';

const props = withDefaults(
  defineProps<{
    items: MenuNode[];
    level?: number;
  }>(),
  {
    level: 1,
  },
);

function shouldShowIcon(item: MenuNode) {
  return props.level === 1 && !!item.icon;
}
</script>

<template>
  <template v-for="item in items" :key="item.id">
    <!-- 含子菜单 -->
    <el-sub-menu v-if="item.children && item.children.length" :index="item.path || `sub-${item.id}`">
      <template #title>
        <el-icon v-if="shouldShowIcon(item)"><component :is="item.icon" /></el-icon>
        <span>{{ item.name }}</span>
      </template>
      <MenuTree :items="item.children" :level="props.level + 1" />
    </el-sub-menu>

    <!-- 叶子菜单 -->
    <el-menu-item v-else :index="item.path">
      <el-icon v-if="shouldShowIcon(item)"><component :is="item.icon" /></el-icon>
      <template #title>{{ item.name }}</template>
    </el-menu-item>
  </template>
</template>
