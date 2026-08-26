import request from '@/utils/request';

export type KnowledgeChunkSeparator = 'length' | 'paragraph';
export type KnowledgeChunkMode = 'auto' | 'manual';

export interface KnowledgeChunkConfig {
  id: number;
  name: string;
  chunkMode: KnowledgeChunkMode;
  chunkSize: number;
  chunkOverlap: number;
  timeoutMinutes: number;
  pdfOcrMaxPages: number;
  manualMaxChunks: number;
  separator: KnowledgeChunkSeparator;
  preserveHeading: boolean;
  isDefault: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QueryKnowledgeChunkConfigParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  chunkMode?: KnowledgeChunkMode;
}

export interface KnowledgeChunkConfigListResult {
  list: KnowledgeChunkConfig[];
  total: number;
}

export type KnowledgeChunkConfigForm = Pick<
  KnowledgeChunkConfig,
  | 'name'
  | 'chunkMode'
  | 'chunkSize'
  | 'chunkOverlap'
  | 'timeoutMinutes'
  | 'pdfOcrMaxPages'
  | 'manualMaxChunks'
  | 'separator'
  | 'preserveHeading'
  | 'isDefault'
  | 'isEnabled'
>;

export function getKnowledgeChunkConfigs(params: QueryKnowledgeChunkConfigParams) {
  return request.get<unknown, KnowledgeChunkConfigListResult>(
    '/knowledge-chunk-configs',
    { params },
  );
}

export function getKnowledgeChunkConfig(id: number) {
  return request.get<unknown, KnowledgeChunkConfig>(
    `/knowledge-chunk-configs/${id}`,
  );
}

export function createKnowledgeChunkConfig(
  data: Partial<KnowledgeChunkConfigForm>,
) {
  return request.post<unknown, KnowledgeChunkConfig>(
    '/knowledge-chunk-configs',
    data,
  );
}

export function updateKnowledgeChunkConfig(
  id: number,
  data: Partial<KnowledgeChunkConfigForm>,
) {
  return request.patch<unknown, KnowledgeChunkConfig>(
    `/knowledge-chunk-configs/${id}`,
    data,
  );
}

export function deleteKnowledgeChunkConfig(id: number) {
  return request.delete<unknown, { id: number }>(
    `/knowledge-chunk-configs/${id}`,
  );
}

export function batchDeleteKnowledgeChunkConfigs(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>(
    '/knowledge-chunk-configs/batch-delete',
    { ids: ids.map(Number) },
  );
}
