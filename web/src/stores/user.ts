import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  login as loginApi,
  getProfile,
  type LoginParams,
  type UserInfo,
} from '@/api/auth';
import { getMyMenus, type MenuNode } from '@/api/menu';

const TOKEN_KEY = 'token';

export const useUserStore = defineStore('user', () => {
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) || '');
  const userInfo = ref<UserInfo | null>(null);
  // 当前用户可见菜单树（后端按权限下发）
  const menus = ref<MenuNode[]>([]);
  // 会话数据（用户信息 + 菜单）是否已加载完成
  const loaded = ref(false);
  // 引导加载的进行中 Promise，避免并发重复请求
  let bootstrapPromise: Promise<void> | null = null;

  // 当前用户权限点集合
  const permissions = computed(() => userInfo.value?.permissions ?? []);
  // 超级管理员：放行一切权限（后端 isAdmin 字段）
  const isAdmin = computed(() => Boolean(userInfo.value?.isAdmin));

  function setToken(value: string) {
    token.value = value;
    localStorage.setItem(TOKEN_KEY, value);
  }

  /** 权限校验：超管放行，否则按权限点判断 */
  function hasPermission(code?: string) {
    if (!code) return true;
    if (isAdmin.value) return true;
    if (permissions.value.includes(code)) return true;
    const action = code.includes('.') ? code.split('.').pop() : '';
    return !!action && permissions.value.includes(action);
  }

  /** 登录 */
  async function login(params: LoginParams) {
    const res = await loginApi(params);
    setToken(res.access_token);
    userInfo.value = res.user;
    // 登录后即拉取菜单，标记会话已就绪，避免进入应用后二次引导
    menus.value = await getMyMenus();
    loaded.value = true;
    return res;
  }

  /** 拉取当前用户信息 */
  async function fetchProfile() {
    const info = await getProfile();
    userInfo.value = info;
    return info;
  }

  /** 拉取当前用户菜单 */
  async function fetchMenus() {
    menus.value = await getMyMenus();
    return menus.value;
  }

  /**
   * 会话引导：token 存在但会话未加载时，一次性拉取用户信息 + 菜单。
   * 并发调用共享同一 Promise；失败时抛出，由调用方（路由守卫）处理登出。
   */
  function bootstrap() {
    if (loaded.value) return Promise.resolve();
    if (bootstrapPromise) return bootstrapPromise;
    bootstrapPromise = Promise.all([fetchProfile(), fetchMenus()])
      .then(() => {
        loaded.value = true;
      })
      .catch((err) => {
        loaded.value = false;
        throw err;
      })
      .finally(() => {
        bootstrapPromise = null;
      });
    return bootstrapPromise;
  }

  /** 登出 */
  function logout() {
    token.value = '';
    userInfo.value = null;
    menus.value = [];
    loaded.value = false;
    bootstrapPromise = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  return {
    token,
    userInfo,
    menus,
    loaded,
    permissions,
    isAdmin,
    hasPermission,
    login,
    fetchProfile,
    fetchMenus,
    bootstrap,
    logout,
  };
});
