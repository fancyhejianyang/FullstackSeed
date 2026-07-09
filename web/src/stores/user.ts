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

  // 当前用户权限点集合
  const permissions = computed(() => userInfo.value?.permissions ?? []);
  // 超级管理员：放行一切权限（后端 isAdmin 字段）
  const isAdmin = computed(() => userInfo.value?.isAdmin === true);

  function setToken(value: string) {
    token.value = value;
    localStorage.setItem(TOKEN_KEY, value);
  }

  /** 权限校验：超管放行，否则按权限点判断 */
  function hasPermission(code?: string) {
    if (!code) return true;
    if (isAdmin.value) return true;
    return permissions.value.includes(code);
  }

  /** 登录 */
  async function login(params: LoginParams) {
    const res = await loginApi(params);
    setToken(res.access_token);
    userInfo.value = res.user;
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

  /** 登出 */
  function logout() {
    token.value = '';
    userInfo.value = null;
    menus.value = [];
    localStorage.removeItem(TOKEN_KEY);
  }

  return {
    token,
    userInfo,
    menus,
    permissions,
    isAdmin,
    hasPermission,
    login,
    fetchProfile,
    fetchMenus,
    logout,
  };
});
