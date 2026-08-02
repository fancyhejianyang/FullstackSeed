import request from '@/utils/request';
import type { BoolLike } from './user';

export type MenuType = 'menu' | 'button';

export interface MenuNode {
  id: number;
  parentId: number | null;
  name: string;
  path: string;
  icon: string;
  sort: number;
  type: MenuType;
  permissionCode: string;
  // 系统固定菜单：仅超管可见、不可分配给角色（由「系统配置 > 配置菜单」维护）
  isSystem: BoolLike;
  isActive: BoolLike;
  children: MenuNode[];
}

export interface MenuForm {
  parentId?: number | null;
  name: string;
  path?: string;
  icon?: string;
  sort?: number;
  type?: MenuType;
  permissionCode?: string;
  isSystem?: BoolLike;
  isActive?: BoolLike;
}

/** 当前用户可见菜单树（按权限过滤，超管返回全部） */
export function getMyMenus() {
  return request.get<unknown, MenuNode[]>('/menus/mine');
}

/** 完整菜单树（管理用，需 Menu.read 权限） */
export function getMenuTree() {
  return request.get<unknown, MenuNode[]>('/menus');
}

/** 创建菜单 */
export function createMenu(data: MenuForm) {
  return request.post<unknown, MenuNode>('/menus', data);
}

/** 更新菜单 */
export function updateMenu(id: number, data: Partial<MenuForm>) {
  return request.patch<unknown, MenuNode>(`/menus/${id}`, data);
}

/** 删除菜单 */
export function deleteMenu(id: number) {
  return request.delete<unknown, { id: number }>(`/menus/${id}`);
}
