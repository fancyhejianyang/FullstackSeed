<script setup lang="ts">
// 递归渲染菜单树：有 children 用 el-sub-menu，叶子用 el-menu-item
import type { MenuNode } from '@/api/menu';

defineProps<{ items: MenuNode[] }>();
</script>

<template>
  <template v-for="item in items" :key="item.id">
    <!-- 含子菜单 -->
    <el-sub-menu v-if="item.children && item.children.length" :index="item.path || `sub-${item.id}`">
      <template #title>
        <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
        <span>{{ item.name }}</span>
      </template>
      <MenuTree :items="item.children" />
    </el-sub-menu>

    <!-- 叶子菜单 -->
    <el-menu-item v-else :index="item.path">
      <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
      <template #title>{{ item.name }}</template>
    </el-menu-item>
  </template>
</template>
