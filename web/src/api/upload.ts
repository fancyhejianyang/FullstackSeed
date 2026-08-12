import request from '@/utils/request';

export interface UploadResult {
  url: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
}

/** 通用文件上传：业务模块只保存返回的 url */
export function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return request.post<unknown, UploadResult>('/uploads', formData);
}
