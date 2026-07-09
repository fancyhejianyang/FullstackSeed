import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
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
        path: 'articles',
        name: 'articles',
        component: () => import('@/views/article/Index.vue'),
        meta: { title: '文章管理' },
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/views/user/Index.vue'),
        meta: { title: '账号管理' },
      },
      {
        path: 'roles',
        name: 'roles',
        component: () => import('@/views/role/Index.vue'),
        meta: { title: '角色管理' },
      },
      {
        path: 'permissions',
        name: 'permissions',
        component: () => import('@/views/permission/Index.vue'),
        meta: { title: '权限管理' },
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

// 全局前置守卫：未登录跳转登录页
router.beforeEach((to) => {
  const userStore = useUserStore();
  if (to.meta.public) {
    return true;
  }
  if (!userStore.token) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;
