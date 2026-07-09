import request from '@/utils/request';

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
  isActive: boolean;
  children: MenuNode[];
}

/** 当前用户可见菜单树（按权限过滤） */
export function getMyMenus() {
  return request.get<unknown, MenuNode[]>('/menus/mine');
}
