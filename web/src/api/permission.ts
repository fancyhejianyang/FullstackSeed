import request from '@/utils/request';

export type PermissionType = 'menu' | 'button' | 'api';

export interface Permission {
  id: number;
  code: string;
  name: string;
  type: PermissionType;
  description: string;
  menuId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionListResult {
  list: Permission[];
  total: number;
}

export interface QueryPermissionParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface PermissionForm {
  code: string;
  name: string;
  type?: PermissionType;
  description?: string;
  menuId?: number | null;
}

/** 分页查询权限 */
export function getPermissions(params: QueryPermissionParams) {
  return request.get<unknown, PermissionListResult>('/permissions', { params });
}

/** 查询全部权限（不分页，用于角色绑定选择，取较大 pageSize） */
export function getAllPermissions() {
  return request.get<unknown, PermissionListResult>('/permissions', {
    params: { page: 1, pageSize: 1000 },
  });
}

/** 创建权限 */
export function createPermission(data: PermissionForm) {
  return request.post<unknown, Permission>('/permissions', data);
}

/** 更新权限 */
export function updatePermission(id: number, data: PermissionForm) {
  return request.patch<unknown, Permission>(`/permissions/${id}`, data);
}

/** 删除权限 */
export function deletePermission(id: number) {
  return request.delete<unknown, { id: number }>(`/permissions/${id}`);
}
