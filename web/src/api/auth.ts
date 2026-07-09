import request from '@/utils/request';

export interface LoginParams {
  username: string;
  password: string;
}

export interface UserInfo {
  id: number;
  username: string;
  nickname: string;
  isAdmin: boolean;
  roles: string[];
  permissions: string[];
}

export interface LoginResult {
  access_token: string;
  user: UserInfo;
}

/** 登录 */
export function login(data: LoginParams) {
  return request.post<unknown, LoginResult>('/auth/login', data);
}

/** 获取当前用户信息 */
export function getProfile() {
  return request.get<unknown, UserInfo>('/auth/profile');
}
