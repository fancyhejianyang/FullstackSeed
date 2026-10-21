import request from '@/utils/request';

export interface ContentSourceMaterial {
  title: string;
  url: string;
  sourceName: string;
  publishedAt: string | null;
  fetchedAt: string;
  contentExcerpt: string;
  acquisition: 'page' | 'feed' | 'aiSearch';
  accountName?: string | null;
  accountMatched?: boolean;
}

export interface ContentArticleForm {
  title: string;
  coverUrl: string;
  idea: string;
  content: string;
  aiConfigId: number | null;
  templateId: number | null;
}
export interface ContentArticle extends ContentArticleForm {
  sourceTopicId?: number | null;
  sourceMaterials?: ContentSourceMaterial[] | null;
  id: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export type ContentArticleSummary = Pick<
  ContentArticle,
  'id' | 'title' | 'coverUrl' | 'version' | 'createdAt' | 'updatedAt'
> & {
  latestTask: (ContentTask & { generatedCoverUrl?: string | null }) | null;
};

export function getContentArticles(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
}) {
  return request.get<unknown, { list: ContentArticleSummary[]; total: number }>(
    '/content-articles',
    { params },
  );
}
export function getContentArticle(id: number, silentError = false) {
  return request.get<unknown, ContentArticle>(`/content-articles/${id}`, {
    silentError,
  });
}
export function createContentArticle(data: ContentArticleForm) {
  return request.post<unknown, ContentArticle>('/content-articles', data);
}
export function updateContentArticle(
  id: number,
  data: ContentArticleForm & { version: number },
) {
  return request.patch<unknown, ContentArticle>(
    `/content-articles/${id}`,
    data,
  );
}
export function deleteContentArticle(id: number) {
  return request.delete<unknown, { id: number }>(`/content-articles/${id}`);
}
export function batchDeleteContentArticles(ids: Array<string | number>) {
  return request.post('/content-articles/batch-delete', {
    ids: ids.map(Number),
  });
}
export type ContentTaskStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'needs_input'
  | 'failed'
  | 'interrupted'
  | 'adopted';
export interface ContentTask {
  coverStatus?:
    | 'pending'
    | 'running'
    | 'succeeded'
    | 'skipped'
    | 'failed'
    | 'interrupted'
    | null;
  id: number;
  articleId: number;
  articleVersion: number;
  status: ContentTaskStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  totalTokens: number | null;
}
export interface ContentTaskDetail extends ContentTask {
  coverData?: {
    url?: string;
    prompt?: string;
    model?: string;
    totalTokens?: number | null;
    message?: string;
  } | null;
  generatedTitle: string | null;
  snapshot: {
    sourceMaterials?: ContentSourceMaterial[];
    title: string;
    idea: string;
    template: { id: number | null; name: string; instruction: string };
    config: {
      id: number;
      name: string;
      providerId: number;
      providerName: string;
      model: string;
      temperature: number;
      thinkingParameters: Record<string, unknown> | null;
      systemPrompt: string;
      responseFormat?: 'text' | 'markdown';
    };
  };
  result: string | null;
  editorNotes: string[] | null;
}
export interface ContentGenerationConfigOption {
  id: number;
  name: string;
  model: string | null;
  responseFormat: 'text' | 'markdown';
}
export interface ContentArticlePreview {
  article: ContentArticle;
  latestTask: ContentTaskDetail | null;
}
export interface ContentTaskQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  articleId?: number;
  status?: ContentTaskStatus;
}
export function getContentArticlePreview(id: number, silentError = false) {
  return request.get<unknown, ContentArticlePreview>(
    `/content-articles/${id}/preview`,
    { silentError },
  );
}
export function getContentGenerationRecords(
  params: ContentTaskQuery,
  silentError = false,
) {
  return request.get<
    unknown,
    { list: (ContentTask & { articleTitle: string })[]; total: number }
  >('/content-articles/tasks', { params, silentError });
}
export function getContentGenerationConfigs(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
}) {
  return request.get<
    unknown,
    { list: ContentGenerationConfigOption[]; total: number }
  >('/content-articles/generation-configs', { params });
}
export function generateContentArticle(
  id: number,
  data: {
    version: number;
    requestId: string;
    aiConfigId: number;
    templateId?: number;
  },
) {
  return request.post<unknown, ContentTask>(
    `/content-articles/${id}/generate`,
    data,
  );
}
export function getContentTasks(
  id: number,
  params: { page?: number; pageSize?: number },
  silentError = false,
) {
  return request.get<unknown, { list: ContentTask[]; total: number }>(
    `/content-articles/${id}/tasks`,
    { params, silentError },
  );
}
export function getContentTask(id: number, silentError = false) {
  return request.get<unknown, ContentTaskDetail>(
    `/content-articles/tasks/${id}`,
    { silentError },
  );
}
export function adoptContentTask(
  id: number,
  version: number,
  adoptTitle = false,
  adoptCover = false,
) {
  return request.post<unknown, ContentArticle>(
    `/content-articles/tasks/${id}/adopt`,
    { version, adoptTitle, adoptCover },
  );
}
