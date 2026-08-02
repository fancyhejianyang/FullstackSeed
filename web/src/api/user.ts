import request from '@/utils/request';

export type BoolNumber = 0 | 1;

export interface UserRole {
  id: number;
  code: string;
  name: string;
}

export interface UserItem {
  id: number;
  username: string;
  nickname: string;
  isActive: boolean | BoolNumber;
  isAdmin: boolean | BoolNumber;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
}

export interface UserListResult {
  list: UserItem[];
  total: number;
}

export interface QueryUserParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface UserForm {
  username: string;
  password?: string;
  nickname?: string;
  isActive?: boolean | BoolNumber;
  isAdmin?: boolean | BoolNumber;
  roleIds?: number[];
}

/** 分页查询用户 */
export function getUsers(params: QueryUserParams) {
  return request.get<unknown, UserListResult>('/users', { params });
}

/** 用户详情（编辑/查看态取最新数据） */
export function getUser(id: number) {
  return request.get<unknown, UserItem>(`/users/${id}`);
}

/** 创建用户 */
export function createUser(data: UserForm) {
  return request.post<unknown, UserItem>('/users', data);
}

/** 更新用户 */
export function updateUser(id: number, data: UserForm) {
  return request.patch<unknown, UserItem>(`/users/${id}`, data);
}

/** 删除用户 */
export function deleteUser(id: number) {
  return request.delete<unknown, { id: number }>(`/users/${id}`);
}
