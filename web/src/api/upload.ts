import request from '@/utils/request';

export interface UploadResult {
  fileId?: number;
  url: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface UploadRequestOptions {
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
  timeout?: number;
  silentError?: boolean;
}

export type UploadRequest = (file: File, options?: UploadRequestOptions) => Promise<UploadResult>;

/** 通用文件上传：业务模块只保存返回的 url */
export function uploadFile(file: File, options: UploadRequestOptions = {}) {
  const formData = new FormData();
  formData.append('file', file);
  return request.post<unknown, UploadResult>('/uploads', formData, {
    timeout: options.timeout ?? 120000,
    signal: options.signal,
    silentError: options.silentError,
    onUploadProgress: (event) => {
      if (event.total) options.onProgress?.(Math.min(100, Math.round(event.loaded / event.total * 100)));
    },
  });
}

/** Releasing a reference only schedules a later server-side check, never an immediate physical deletion. */
export function releaseUpload(url: string) {
  return request.post('/uploads/release', { url }, { silentError: true });
}

export async function downloadUpload(url: string, name = '附件文件', signal?: AbortSignal): Promise<void> {
  if (url.startsWith('blob:')) {
    saveBlobUrl(url, name);
    return;
  }
  const blob = await request.post<unknown, Blob>('/uploads/download', { url, name }, {
    responseType: 'blob', timeout: 120000, signal, silentError: true,
  });
  const objectUrl = URL.createObjectURL(blob);
  try { saveBlobUrl(objectUrl, name); }
  finally { setTimeout(() => URL.revokeObjectURL(objectUrl), 60000); }
}

function saveBlobUrl(url: string, name: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
