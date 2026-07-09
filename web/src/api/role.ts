import request from '@/utils/request';
import type { Permission } from './permission';

export interface Role {
  id: number;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
}

export interface RoleListResult {
  list: Role[];
  total: number;
}

export interface QueryRoleParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface RoleForm {
  code: string;
  name: string;
  description?: string;
  isActive?: boolean;
  permissionIds?: number[];
}

/** 分页查询角色 */
export function getRoles(params: QueryRoleParams) {
  return request.get<unknown, RoleListResult>('/roles', { params });
}

/** 创建角色 */
export function createRole(data: RoleForm) {
  return request.post<unknown, Role>('/roles', data);
}

/** 更新角色 */
export function updateRole(id: number, data: RoleForm) {
  return request.patch<unknown, Role>(`/roles/${id}`, data);
}

/** 删除角色 */
export function deleteRole(id: number) {
  return request.delete<unknown, { id: number }>(`/roles/${id}`);
}
