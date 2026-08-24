<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { useUserStore } from '@/stores/user';
import MenuTree from '@/components/MenuTree.vue';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const isCollapse = ref(false);
const activeMenu = computed(() => route.path);
const pageTitle = computed(() => String(route.meta.title || ''));

// 菜单来自后端（按权限过滤，超管返回全部），由路由守卫在进入前引导加载
const menus = computed(() => userStore.menus);

async function handleLogout() {
  await ElMessageBox.confirm('确认退出登录？', '提示', { type: 'warning' });
  userStore.logout();
  router.push('/login');
}
</script>

<template>
  <el-container class="layout">
    <el-aside :width="isCollapse ? '64px' : '210px'" class="layout__aside">
      <div class="layout__logo">{{ isCollapse ? 'FS' : 'FullstackSeed' }}</div>
      <el-menu
        class="layout__menu"
        :default-active="activeMenu"
        :collapse="isCollapse"
        router
      >
        <MenuTree :items="menus" />
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="layout__header">
        <div class="layout__header-left">
          <el-icon class="layout__collapse" @click="isCollapse = !isCollapse">
            <component :is="isCollapse ? 'Expand' : 'Fold'" />
          </el-icon>
          <h1 class="layout__title">{{ pageTitle }}</h1>
        </div>
        <el-dropdown @command="handleLogout">
          <span class="layout__user">
            {{ userStore.userInfo?.nickname || userStore.userInfo?.username || '用户' }}
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>

      <el-main class="layout__main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  height: 100vh;
}
.layout__aside {
  display: flex;
  flex-direction: column;
  background: #304156;
  transition: width 0.2s;
  overflow: hidden;
}
.layout__logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  color: #fff;
  font-weight: 600;
  white-space: nowrap;
}
.layout__aside :deep(.el-menu) {
  border-right: none;
  background: #304156;
}
.layout__menu {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}
.layout__menu::-webkit-scrollbar {
  width: 6px;
}
.layout__menu::-webkit-scrollbar-thumb {
  background: rgba(191, 203, 217, 0.28);
  border-radius: 6px;
}
.layout__menu::-webkit-scrollbar-track {
  background: transparent;
}
.layout__aside :deep(.el-menu-item),
.layout__aside :deep(.el-sub-menu__title) {
  color: #bfcbd9;
  transition: color 0.2s, background-color 0.2s;
}
.layout__aside :deep(.el-menu-item:hover),
.layout__aside :deep(.el-sub-menu__title:hover) {
  color: #fff;
  background: rgba(64, 158, 255, 0.12);
}
.layout__aside :deep(.el-sub-menu.is-opened > .el-sub-menu__title),
.layout__aside :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
  color: #fff;
  font-weight: 600;
}
.layout__aside :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
  background: #263445;
  box-shadow: inset 3px 0 0 #409eff;
}
.layout__aside :deep(.el-menu-item.is-active) {
  color: #fff;
  font-weight: 600;
  background: #263445;
  box-shadow: inset 3px 0 0 #409eff;
}
.layout__aside :deep(.el-menu-item.is-active:hover) {
  background: #263445;
}
.layout__aside :deep(.el-sub-menu .el-menu) {
  background: #304156;
}
.layout__aside :deep(.el-sub-menu .el-menu-item) {
  padding-left: 50px;
}
.layout__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #dcdfe6;
}
.layout__header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.layout__collapse {
  font-size: 20px;
  cursor: pointer;
  flex: 0 0 auto;
}
.layout__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.layout__user {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  outline: none;
}
.layout__main {
  background: #f0f2f5;
}
</style>
