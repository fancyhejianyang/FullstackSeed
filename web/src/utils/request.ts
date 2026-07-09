import axios from 'axios';
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';

/**
 * 后端统一响应结构（与 NestJS TransformInterceptor 对齐）
 */
export interface ApiResponse<T = unknown> {
  statusCode: number;
  data: T;
  success: boolean;
  message: string;
  timestamp: string;
}

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
});

// 请求拦截器：注入 Token
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// 响应拦截器：拆包 + 统一错误处理
service.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data;
    // 约定：success 为业务成功标志
    if (res && typeof res === 'object' && 'success' in res) {
      if (res.success) {
        return res.data as unknown as AxiosResponse;
      }
      ElMessage.error(res.message || '请求失败');
      return Promise.reject(new Error(res.message || 'Error'));
    }
    // 非统一结构时直接返回原始数据
    return res as unknown as AxiosResponse;
  },
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      localStorage.removeItem('token');
      ElMessage.error('登录已过期，请重新登录');
    } else {
      ElMessage.error(error?.response?.data?.message || error.message || '网络错误');
    }
    return Promise.reject(error);
  },
);

export default service;
