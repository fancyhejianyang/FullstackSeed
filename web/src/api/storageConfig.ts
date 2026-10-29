import request from "@/utils/request";

export type StorageProvider = "local" | "aliyun-oss" | "tencent-cos" | "qiniu";

export interface StorageConfig {
  enabled: boolean;
  provider: StorageProvider;
  publicBaseUrl: string;
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  accessKeySecret: string;
  uploadDir: string;
  updatedAt: string;
  accessKeyIdSet?: boolean;
  accessKeySecretSet?: boolean;
}

export function getStorageConfig() {
  return request.get<unknown, StorageConfig>("/storage-config");
}

export function updateStorageConfig(
  data: Omit<
    StorageConfig,
    "updatedAt" | "accessKeyIdSet" | "accessKeySecretSet"
  > & { clearCredentials?: boolean },
) {
  return request.put<unknown, StorageConfig>("/storage-config", data);
}

export type ManagedCleanupScope = "ai-materials" | "comfyui" | "uploads";

export interface ManagedCleanupPreview {
  scope: ManagedCleanupScope;
  environment: string;
  count: number;
  totalSize: number;
  fileIds: number[];
  list: Array<{
    id: number;
    status: string;
    size: number;
    createdAt: string;
    deleteAfter: string | null;
  }>;
}

export function getManagedCleanupPreview(
  scope: ManagedCleanupScope = "ai-materials",
) {
  return request.get<unknown, ManagedCleanupPreview>(
    "/media-storage/cleanup-preview",
    { params: { scope, limit: 100 } },
  );
}

export function cleanupManagedFiles(
  fileIds: number[],
  scope: ManagedCleanupScope = "ai-materials",
) {
  return request.post<
    unknown,
    { requested: number; deleted: number; failed: number }
  >("/media-storage/cleanup", { fileIds, scope });
}
