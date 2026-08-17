import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/HomeView.vue'),
        meta: { title: '首页' },
      },
      {
        path: 'demo',
        name: 'demo',
        component: () => import('@/views/demo/Index.vue'),
        meta: { title: '示例管理', permission: 'Demo.read' },
      },
      {
        path: 'knowledge-bases',
        name: 'knowledge-bases',
        redirect: '/knowledge-bases/categories',
        meta: { title: '知识库管理', permission: 'KnowledgeBase.read' },
      },
      {
        path: 'knowledge-bases/categories',
        name: 'knowledge-base-categories',
        component: () => import('@/views/knowledge-base/Categories.vue'),
        meta: { title: '知识库分类', permission: 'KnowledgeBase.read' },
      },
      {
        path: 'knowledge-bases/list',
        name: 'knowledge-base-list',
        component: () => import('@/views/knowledge-base/Index.vue'),
        meta: { title: '知识库列表', permission: 'KnowledgeBase.read' },
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/views/user/Index.vue'),
        meta: { title: '账号管理', permission: 'User.read' },
      },
      {
        path: 'roles',
        name: 'roles',
        component: () => import('@/views/role/Index.vue'),
        meta: { title: '角色管理', permission: 'Role.read' },
      },
      {
        path: 'permissions',
        name: 'permissions',
        component: () => import('@/views/permission/Index.vue'),
        meta: { title: '权限管理', permission: 'Permission.read' },
      },
      {
        path: 'menus',
        name: 'menus',
        component: () => import('@/views/menu/Index.vue'),
        meta: { title: '菜单管理', permission: 'Menu.read' },
      },
      {
        path: 'system-config',
        name: 'system-config',
        redirect: '/system-config/menu',
        meta: { title: '系统配置', permission: 'Menu.read' },
      },
      {
        path: 'system-config/menu',
        name: 'system-config-menu',
        component: () => import('@/views/system/Index.vue'),
        meta: { title: '配置菜单', permission: 'Menu.read' },
      },
      {
        path: 'system-config/ai',
        name: 'system-config-ai',
        component: () => import('@/views/knowledge-ai-provider/Index.vue'),
        meta: { title: 'AI 大模型账号', permission: 'Menu.read' },
      },
      {
        path: 'system-config/ai-chat',
        name: 'system-config-ai-chat',
        component: () => import('@/views/knowledge-ai-chat/Index.vue'),
        meta: { title: 'AI 问答测试', permission: 'Menu.read' },
      },
      {
        path: 'system-config/ai-record',
        name: 'system-config-ai-record',
        component: () => import('@/views/knowledge-ai-record/Index.vue'),
        meta: { title: '问题记录', permission: 'Menu.read' },
      },
      {
        path: 'system-config/wechat',
        name: 'system-config-wechat',
        component: () => import('@/views/system/Wechat.vue'),
        meta: { title: '微信 / 小程序', permission: 'Menu.read' },
      },
      {
        path: 'system-config/log-record',
        name: 'system-config-log-record',
        component: () => import('@/views/log-record/Index.vue'),
        meta: { title: '日志记录', permission: 'Menu.read' },
      },
      {
        path: 'system-config/data-import',
        name: 'system-config-data-import',
        component: () => import('@/views/data-import/Index.vue'),
        meta: { title: '数据导入', permission: 'Menu.read' },
      },
      {
        path: 'system-config/storage',
        name: 'system-config-storage',
        component: () => import('@/views/storage-config/Index.vue'),
        meta: { title: 'OSS/CDN 配置', permission: 'Menu.read' },
      },
      {
        path: 'system-config/mineru',
        name: 'system-config-mineru',
        component: () => import('@/views/mineru-config/Index.vue'),
        meta: { title: 'MinerU 解析配置', permission: 'Menu.read' },
      },
      {
        // 布局内兜底 404（保留侧边栏）
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('@/views/error/NotFound.vue'),
        meta: { title: '页面不存在' },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// 全局前置守卫：
// 1. 公开页直接放行
// 2. 未登录跳转登录页
// 3. 已登录但会话（用户信息 + 菜单）未加载时，先引导加载再放行；
//    引导失败（如 token 失效）则登出并跳登录页
router.beforeEach(async (to) => {
  const userStore = useUserStore();
  if (to.meta.public) {
    return true;
  }
  if (!userStore.token) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (!userStore.loaded) {
    try {
      await userStore.bootstrap();
    } catch {
      userStore.logout();
      return { path: '/login', query: { redirect: to.fullPath } };
    }
  }
  const permission = to.meta.permission;
  if (typeof permission === 'string' && !userStore.hasPermission(permission)) {
    ElMessage.warning('暂无权限访问该页面');
    return { path: '/' };
  }
  return true;
});

export default router;
