<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { useUserStore } from '@/stores/user';
import MenuTree from '@/components/MenuTree.vue';
import type { MenuNode } from '@/api/menu';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

interface MenuExpose {
  open: (index: string) => void;
}

const isCollapse = ref(false);
const menuRef = ref<MenuExpose | null>(null);
const activeMenu = computed(() =>
  route.path === '/ai-config' || route.path.startsWith('/ai-config/')
    ? '/ai-config'
    : route.path,
);
const pageTitle = computed(() => String(route.meta.title || ''));

// 菜单来自后端（按权限过滤，超管返回全部），由路由守卫在进入前引导加载
const menus = computed(() => userStore.menus);
const menuSearch = ref('');
const searchKeyword = computed(() => menuSearch.value.trim().toLocaleLowerCase());
const searchResult = computed(() => {
  const opened: string[] = [];
  function filter(items: MenuNode[], parentMatched = false): MenuNode[] {
    return items.flatMap((item) => {
      const matched = parentMatched || item.name.toLocaleLowerCase().includes(searchKeyword.value);
      const children = filter(item.children || [], matched);
      if (!matched && !children.length) return [];
      if (children.length) opened.push(item.path || `sub-${item.id}`);
      return [{ ...item, children }];
    });
  }
  return { items: searchKeyword.value ? filter(menus.value) : [], opened };
});
const visibleMenus = computed(() =>
  searchKeyword.value ? searchResult.value.items : menus.value,
);

watch(
  searchResult,
  async ({ opened }) => {
    const keyword = searchKeyword.value;
    if (!keyword || isCollapse.value) return;
    await nextTick();
    if (searchKeyword.value !== keyword) return;
    opened.forEach((index) => menuRef.value?.open(index));
  },
  { flush: 'post' },
);

watch(isCollapse, (collapsed) => {
  if (collapsed) menuSearch.value = '';
});

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
      <div v-if="!isCollapse" class="layout__menu-search">
        <el-input
          v-model="menuSearch"
          placeholder="搜索菜单..."
          aria-label="搜索菜单"
          clearable
          @keydown.esc="menuSearch = ''"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
      </div>
      <!-- 菜单根节点始终挂载，避免 v-show 触发 el-menu 折叠过渡并残留 64px 宽度。 -->
      <div class="layout__menu-area">
        <el-menu
          ref="menuRef"
          class="layout__menu"
          :default-active="activeMenu"
          :collapse="isCollapse"
          router
        >
          <MenuTree :items="visibleMenus" />
        </el-menu>
        <div
          v-if="searchKeyword && !searchResult.items.length"
          class="layout__menu-empty"
          role="status"
        >
          未找到匹配菜单
        </div>
      </div>
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
  flex-shrink: 0;
  height: 60px;
  line-height: 60px;
  text-align: center;
  color: #fff;
  font-weight: 600;
  white-space: nowrap;
}
.layout__menu-search {
  flex-shrink: 0;
  padding: 8px 12px 16px;
}
.layout__menu-search :deep(.el-input) {
  --el-input-bg-color: #263445;
  --el-input-text-color: #fff;
  --el-input-placeholder-color: #bfcbd9;
  --el-input-icon-color: #bfcbd9;
  --el-input-border-color: rgba(191, 203, 217, 0.28);
  --el-input-hover-border-color: #bfcbd9;
  --el-input-focus-border-color: #409eff;
}
.layout__menu-empty {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  padding: 20px 12px;
  color: #bfcbd9;
  font-size: 14px;
  text-align: center;
  background: #304156;
  pointer-events: none;
}
.layout__aside :deep(.el-menu) {
  border-right: none;
  background: #304156;
}
.layout__menu-area {
  position: relative;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
}
.layout__menu {
  width: 100%;
  height: 100%;
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
  background: #304156;
  box-shadow: none;
}
.layout__aside :deep(.el-menu-item.is-active) {
  color: #fff;
  font-weight: 600;
  background: #1f5f99;
  box-shadow: inset 3px 0 0 #409eff;
}
.layout__aside :deep(.el-menu-item.is-active:hover) {
  background: #1f5f99;
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
