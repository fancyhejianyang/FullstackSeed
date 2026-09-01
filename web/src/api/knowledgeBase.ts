import request from '@/utils/request';

/**
 * 校验并返回合法的正整数 ID。
 * 接口层是数据边界，提前拦截 undefined/NaN/Infinity/负数，
 * 避免生成 `/knowledge-bases/undefined` 之类的畸形 URL。
 */
function assertId(id: number | string | undefined, name: string): number {
  const value = typeof id === 'string' ? Number(id) : id;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`[knowledgeBase] 非法 ${name}: ${String(id)}`);
  }
  return value;
}

export interface KnowledgeBase {
  id: number;
  categoryId: number | null;
  name: string;
  code: string;
  description: string | null;
  hitKeywords: string | null;
  colloquialDescription: string | null;
  matchPriority: number;
  contentType: 'text' | 'pdf' | 'word' | 'image';
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
  hitKeywords: string | null;
  colloquialDescription: string | null;
  matchPriority: number;
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
  // AI 检索辅助字段（与后端实体对齐）
  hitKeywords: string | null;
  colloquialDescription: string | null;
  matchPriority: number;
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
  coreContent: string | null;
  manualStartOffset: number | null;
  manualEndOffset: number | null;
  contextBeforeLength: number;
  contextAfterLength: number;
  tokenCount: number;
  sort: number;
  vectorId: string | null;
  contentHash: string | null;
  vectorStatus: string;
  vectorError: string | null;
  vectorizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseIndex {
  id: number;
  knowledgeBaseId: number;
  documentId: number;
  chunkId: number;
  chunkIndex: number;
  title: string;
  vectorId: string | null;
  vectorStatus: string;
  vectorError: string | null;
  vectorizedAt: string | null;
  indexedContentHash: string | null;
  currentContentHash: string;
  indexText: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface KnowledgeBaseMineruTaskPayload {
  fileUrl: string;
  fileName?: string;
}

export interface KnowledgeBaseMineruParsePayload
  extends KnowledgeBaseMineruTaskPayload {
  waitForResult?: boolean;
}

export interface ParseKnowledgeBaseDocumentPayload {
  parseMode?: KnowledgeBaseParseMode;
  fileUrl?: string;
  fileName?: string;
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
  parseMode?: KnowledgeBaseParseMode;
  taskId?: string;
  status?: string;
  name?: string;
}

export type KnowledgeBaseParseMode = 'manual' | 'ai' | 'ocr' | 'mineru';

export interface ParseKnowledgeBasePayload {
  parseMode?: KnowledgeBaseParseMode;
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
  | 'hitKeywords'
  | 'colloquialDescription'
  | 'matchPriority'
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
  | 'hitKeywords'
  | 'colloquialDescription'
  | 'matchPriority'
  | 'sort'
>;

export type KnowledgeBaseChunkForm = Pick<
  KnowledgeBaseChunk,
  | 'documentId'
  | 'chunkIndex'
  | 'title'
  | 'content'
  | 'tokenCount'
  | 'sort'
  | 'coreContent'
  | 'manualStartOffset'
  | 'manualEndOffset'
  | 'contextBeforeLength'
  | 'contextAfterLength'
>;

export interface ReplaceKnowledgeBaseDocumentChunksPayload {
  chunks: Array<{
    title?: string;
    content: string;
    coreContent?: string;
    manualStartOffset?: number;
    manualEndOffset?: number;
    contextBeforeLength?: number;
    contextAfterLength?: number;
  }>;
}

export interface ReplaceKnowledgeBaseDocumentChunksResult {
  documentId: number;
  chunkCount: number;
  processStage: string;
}

export function getKnowledgeBases(params: QueryKnowledgeBaseParams) {
  return request.get<unknown, ListResult<KnowledgeBase>>('/knowledge-bases', {
    params,
  });
}

export function getKnowledgeBase(id: number) {
  const nid = assertId(id, 'id');
  return request.get<unknown, KnowledgeBase>(`/knowledge-bases/${nid}`);
}

export function createKnowledgeBase(data: Partial<KnowledgeBaseForm>) {
  return request.post<unknown, KnowledgeBase>('/knowledge-bases', data);
}

export function updateKnowledgeBase(id: number, data: Partial<KnowledgeBaseForm>) {
  const nid = assertId(id, 'id');
  return request.patch<unknown, KnowledgeBase>(`/knowledge-bases/${nid}`, data);
}

export function deleteKnowledgeBase(id: number) {
  const nid = assertId(id, 'id');
  return request.delete<unknown, { id: number }>(`/knowledge-bases/${nid}`);
}

export function batchDeleteKnowledgeBases(ids: Array<string | number>) {
  // 过滤并转成合法正整数 id，避免 NaN/0/负数下发到后端
  const validIds = ids
    .map((item) => assertId(item, 'id'))
    .filter((value) => value > 0);
  return request.post<unknown, { ids: number[] }>('/knowledge-bases/batch-delete', {
    ids: validIds,
  });
}

export function parseKnowledgeBase(
  id: number,
  data: ParseKnowledgeBasePayload = {},
) {
  const nid = assertId(id, 'id');
  return request.post<unknown, KnowledgeBaseProcessResult>(
    `/knowledge-bases/${nid}/parse`,
    data,
  );
}

export function chunkKnowledgeBase(id: number) {
  const nid = assertId(id, 'id');
  return request.post<unknown, KnowledgeBaseProcessResult>(
    `/knowledge-bases/${nid}/chunk`,
  );
}

export function indexKnowledgeBase(id: number) {
  const nid = assertId(id, 'id');
  return request.post<unknown, KnowledgeBaseProcessResult>(
    `/knowledge-bases/${nid}/index`,
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

/** 生成下一个知识库分类编码（层级 + 序号：顶级 CAT_001，非顶级=父编码_001） */
export function getNextKnowledgeBaseCategoryCode(parentId?: number) {
  return request.get<unknown, { code: string }>(
    '/knowledge-bases/categories/next-code',
    { params: { parentId: parentId ?? undefined } },
  );
}

/** 生成下一个知识库编码（所属分类编码 + 序号，未选分类时前缀 KB） */
export function getNextKnowledgeBaseCode(categoryId?: number) {
  return request.get<unknown, { code: string }>('/knowledge-bases/next-code', {
    params: { categoryId: categoryId ?? undefined },
  });
}

export function updateKnowledgeBaseCategory(
  id: number,
  data: Partial<KnowledgeBaseCategoryForm>,
) {
  const nid = assertId(id, 'id');
  return request.patch<unknown, KnowledgeBaseCategory>(
    `/knowledge-bases/categories/${nid}`,
    data,
  );
}

export function deleteKnowledgeBaseCategory(id: number) {
  const nid = assertId(id, 'id');
  return request.delete<unknown, { id: number; ids: number[] }>(
    `/knowledge-bases/categories/${nid}`,
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
  const nid = assertId(id, 'id');
  return request.patch<unknown, KnowledgeBaseDocument>(
    `/knowledge-bases/documents/${nid}`,
    data,
  );
}

export function deleteKnowledgeBaseDocument(id: number) {
  const nid = assertId(id, 'id');
  return request.delete<unknown, { id: number }>(
    `/knowledge-bases/documents/${nid}`,
  );
}

export function createKnowledgeBaseMineruTask(
  documentId: number,
  data: KnowledgeBaseMineruTaskPayload,
) {
  const nid = assertId(documentId, 'documentId');
  return request.post<unknown, KnowledgeBaseMineruTaskResult>(
    `/knowledge-bases/documents/${nid}/mineru-tasks`,
    data,
  );
}

export function getKnowledgeBaseMineruTask(documentId: number, taskId: string) {
  const nid = assertId(documentId, 'documentId');
  const safeTaskId = encodeURIComponent(taskId);
  return request.get<unknown, KnowledgeBaseMineruTaskResult>(
    `/knowledge-bases/documents/${nid}/mineru-tasks/${safeTaskId}`,
  );
}

export function parseKnowledgeBaseDocumentWithMineru(
  documentId: number,
  data: KnowledgeBaseMineruParsePayload,
) {
  const nid = assertId(documentId, 'documentId');
  return request.post<unknown, KnowledgeBaseMineruTaskResult>(
    `/knowledge-bases/documents/${nid}/mineru-parse`,
    data,
  );
}

export function parseKnowledgeBaseDocument(
  documentId: number,
  data: ParseKnowledgeBaseDocumentPayload,
) {
  const nid = assertId(documentId, 'documentId');
  return request.post<
    unknown,
    KnowledgeBaseMineruTaskResult & {
      document?: KnowledgeBaseDocument;
      parseMode?: KnowledgeBaseParseMode;
      taskId?: string;
      status?: string;
      name?: string;
    }
  >(`/knowledge-bases/documents/${nid}/parse`, data);
}

export function getKnowledgeBaseChunks(params: QueryKnowledgeBaseChunkParams) {
  return request.get<unknown, ListResult<KnowledgeBaseChunk>>(
    '/knowledge-bases/chunks',
    { params },
  );
}

export function getKnowledgeBaseIndexes(params: QueryKnowledgeBaseChunkParams) {
  return request.get<unknown, ListResult<KnowledgeBaseIndex>>(
    '/knowledge-bases/indexes',
    { params },
  );
}

export function createKnowledgeBaseChunk(data: Partial<KnowledgeBaseChunkForm>) {
  return request.post<unknown, KnowledgeBaseChunk>('/knowledge-bases/chunks', data);
}

export function replaceKnowledgeBaseDocumentChunks(
  documentId: number,
  data: ReplaceKnowledgeBaseDocumentChunksPayload,
) {
  const nid = assertId(documentId, 'documentId');
  return request.post<unknown, ReplaceKnowledgeBaseDocumentChunksResult>(
    `/knowledge-bases/documents/${nid}/chunks/manual`,
    data,
  );
}

export function updateKnowledgeBaseChunk(
  id: number,
  data: Partial<KnowledgeBaseChunkForm>,
) {
  const nid = assertId(id, 'id');
  return request.patch<unknown, KnowledgeBaseChunk>(
    `/knowledge-bases/chunks/${nid}`,
    data,
  );
}

export function deleteKnowledgeBaseChunk(id: number) {
  const nid = assertId(id, 'id');
  return request.delete<unknown, { id: number }>(`/knowledge-bases/chunks/${nid}`);
}
