import request from '@/utils/request';

export interface ContentArticleForm {
  title: string;
  coverUrl: string;
  idea: string;
  content: string;
}
export interface ContentArticle extends ContentArticleForm {
  id: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export type ContentArticleSummary = Pick<
  ContentArticle,
  'id' | 'title' | 'coverUrl' | 'version' | 'createdAt' | 'updatedAt'
>;

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
export function getContentArticle(id: number) {
  return request.get<unknown, ContentArticle>(`/content-articles/${id}`);
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
export function generateContentArticle(
  data: Pick<ContentArticleForm, 'title' | 'idea'>,
  id?: number,
) {
  return request.post<unknown, { content: string }>(
    id === undefined
      ? '/content-articles/generate'
      : `/content-articles/${id}/generate`,
    data,
    { timeout: 130000 },
  );
}
