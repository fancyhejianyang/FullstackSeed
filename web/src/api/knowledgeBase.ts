import request from '@/utils/request';

export interface KnowledgeBase {
  id: number;
  categoryId: number | null;
  name: string;
  code: string;
  description: string | null;
  contentType: 'text' | 'pdf' | 'word';
  contentText: string | null;
  fileName: string;
  fileUrl: string;
  processStage: string;
  parseStatus: string;
  chunkStatus: string;
  indexStatus: string;
  lastProcessMessage: string | null;
  containsImages: boolean;
  allowFileUpload: boolean;
  isEnabled: boolean;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseCategory {
  id: number;
  parentId: number | null;
  name: string;
  code: string;
  description: string | null;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseCategoryTreeNode extends KnowledgeBaseCategory {
  children: KnowledgeBaseCategoryTreeNode[];
}

export interface KnowledgeBaseDocument {
  id: number;
  knowledgeBaseId: number;
  categoryId: number | null;
  title: string;
  sourceType: string;
  sourceName: string;
  content: string | null;
  status: string;
  description: string | null;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseChunk {
  id: number;
  knowledgeBaseId: number;
  categoryId: number | null;
  documentId: number;
  chunkIndex: number;
  title: string;
  content: string;
  tokenCount: number;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseMineruTaskPayload {
  fileUrl: string;
  fileName?: string;
}

export interface KnowledgeBaseMineruParsePayload
  extends KnowledgeBaseMineruTaskPayload {
  waitForResult?: boolean;
}

export interface KnowledgeBaseMineruTaskResult {
  taskId: string;
  documentId?: number;
  status?: string;
  progress?: number | null;
  message?: string;
  markdown?: string;
  isCompleted?: boolean;
  chunkCount?: number;
  pollIntervalSeconds?: number;
  timeoutMinutes?: number;
}

export interface KnowledgeBaseProcessResult {
  id: number;
  processStage: string;
  documentId?: number;
  chunkCount?: number;
}

export interface ListResult<T> {
  list: T[];
  total: number;
}

export interface QueryKnowledgeBaseParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  categoryId?: number;
}

export interface QueryKnowledgeBaseCategoryParams {
  parentId?: number;
  keyword?: string;
}

export interface QueryKnowledgeBaseDocumentParams {
  page?: number;
  pageSize?: number;
  knowledgeBaseId?: number;
  categoryId?: number;
  keyword?: string;
}

export interface QueryKnowledgeBaseChunkParams {
  page?: number;
  pageSize?: number;
  documentId?: number;
  knowledgeBaseId?: number;
  keyword?: string;
}

export type KnowledgeBaseForm = Pick<
  KnowledgeBase,
  | 'categoryId'
  | 'name'
  | 'code'
  | 'description'
  | 'contentType'
  | 'contentText'
  | 'fileName'
  | 'fileUrl'
  | 'isEnabled'
  | 'sort'
>;

export type KnowledgeBaseCategoryForm = Pick<
  KnowledgeBaseCategory,
  'parentId' | 'name' | 'code' | 'description' | 'sort'
>;

export type KnowledgeBaseDocumentForm = Pick<
  KnowledgeBaseDocument,
  | 'knowledgeBaseId'
  | 'categoryId'
  | 'title'
  | 'sourceType'
  | 'sourceName'
  | 'content'
  | 'status'
  | 'description'
  | 'sort'
>;

export type KnowledgeBaseChunkForm = Pick<
  KnowledgeBaseChunk,
  'documentId' | 'chunkIndex' | 'title' | 'content' | 'tokenCount' | 'sort'
>;

export function getKnowledgeBases(params: QueryKnowledgeBaseParams) {
  return request.get<unknown, ListResult<KnowledgeBase>>('/knowledge-bases', {
    params,
  });
}

export function createKnowledgeBase(data: Partial<KnowledgeBaseForm>) {
  return request.post<unknown, KnowledgeBase>('/knowledge-bases', data);
}

export function updateKnowledgeBase(id: number, data: Partial<KnowledgeBaseForm>) {
  return request.patch<unknown, KnowledgeBase>(`/knowledge-bases/${id}`, data);
}

export function deleteKnowledgeBase(id: number) {
  return request.delete<unknown, { id: number }>(`/knowledge-bases/${id}`);
}

export function batchDeleteKnowledgeBases(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>('/knowledge-bases/batch-delete', {
    ids: ids.map(Number),
  });
}

export function parseKnowledgeBase(id: number) {
  return request.post<unknown, KnowledgeBaseProcessResult>(
    `/knowledge-bases/${id}/parse`,
  );
}

export function chunkKnowledgeBase(id: number) {
  return request.post<unknown, KnowledgeBaseProcessResult>(
    `/knowledge-bases/${id}/chunk`,
  );
}

export function indexKnowledgeBase(id: number) {
  return request.post<unknown, KnowledgeBaseProcessResult>(
    `/knowledge-bases/${id}/index`,
  );
}

export function getKnowledgeBaseCategoryTree(
  params: QueryKnowledgeBaseCategoryParams,
) {
  return request.get<unknown, KnowledgeBaseCategoryTreeNode[]>(
    '/knowledge-bases/categories/tree',
    { params },
  );
}

export function createKnowledgeBaseCategory(
  data: Partial<KnowledgeBaseCategoryForm>,
) {
  return request.post<unknown, KnowledgeBaseCategory>(
    '/knowledge-bases/categories',
    data,
  );
}

export function updateKnowledgeBaseCategory(
  id: number,
  data: Partial<KnowledgeBaseCategoryForm>,
) {
  return request.patch<unknown, KnowledgeBaseCategory>(
    `/knowledge-bases/categories/${id}`,
    data,
  );
}

export function deleteKnowledgeBaseCategory(id: number) {
  return request.delete<unknown, { id: number; ids: number[] }>(
    `/knowledge-bases/categories/${id}`,
  );
}

export function getKnowledgeBaseDocuments(
  params: QueryKnowledgeBaseDocumentParams,
) {
  return request.get<unknown, ListResult<KnowledgeBaseDocument>>(
    '/knowledge-bases/documents',
    { params },
  );
}

export function createKnowledgeBaseDocument(
  data: Partial<KnowledgeBaseDocumentForm>,
) {
  return request.post<unknown, KnowledgeBaseDocument>(
    '/knowledge-bases/documents',
    data,
  );
}

export function updateKnowledgeBaseDocument(
  id: number,
  data: Partial<KnowledgeBaseDocumentForm>,
) {
  return request.patch<unknown, KnowledgeBaseDocument>(
    `/knowledge-bases/documents/${id}`,
    data,
  );
}

export function deleteKnowledgeBaseDocument(id: number) {
  return request.delete<unknown, { id: number }>(
    `/knowledge-bases/documents/${id}`,
  );
}

export function createKnowledgeBaseMineruTask(
  documentId: number,
  data: KnowledgeBaseMineruTaskPayload,
) {
  return request.post<unknown, KnowledgeBaseMineruTaskResult>(
    `/knowledge-bases/documents/${documentId}/mineru-tasks`,
    data,
  );
}

export function getKnowledgeBaseMineruTask(documentId: number, taskId: string) {
  return request.get<unknown, KnowledgeBaseMineruTaskResult>(
    `/knowledge-bases/documents/${documentId}/mineru-tasks/${taskId}`,
  );
}

export function parseKnowledgeBaseDocumentWithMineru(
  documentId: number,
  data: KnowledgeBaseMineruParsePayload,
) {
  return request.post<unknown, KnowledgeBaseMineruTaskResult>(
    `/knowledge-bases/documents/${documentId}/mineru-parse`,
    data,
  );
}

export function getKnowledgeBaseChunks(params: QueryKnowledgeBaseChunkParams) {
  return request.get<unknown, ListResult<KnowledgeBaseChunk>>(
    '/knowledge-bases/chunks',
    { params },
  );
}

export function createKnowledgeBaseChunk(data: Partial<KnowledgeBaseChunkForm>) {
  return request.post<unknown, KnowledgeBaseChunk>('/knowledge-bases/chunks', data);
}

export function updateKnowledgeBaseChunk(
  id: number,
  data: Partial<KnowledgeBaseChunkForm>,
) {
  return request.patch<unknown, KnowledgeBaseChunk>(
    `/knowledge-bases/chunks/${id}`,
    data,
  );
}

export function deleteKnowledgeBaseChunk(id: number) {
  return request.delete<unknown, { id: number }>(`/knowledge-bases/chunks/${id}`);
}
