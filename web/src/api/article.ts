import request from '@/utils/request';
import { ARTICLE_CATEGORY, ARTICLE_STATUS } from '@/dic';

/** 文章分类值（与后端 articles.constants.ts 保持一致） */
export type ArticleCategory = (typeof ARTICLE_CATEGORY.items)[number]['value'];

/** 文章状态值（与后端 articles.constants.ts 保持一致） */
export type ArticleStatus = (typeof ARTICLE_STATUS.items)[number]['value'];

export interface Article {
  id: number;
  title: string;
  content: string;
  category: ArticleCategory;
  status: ArticleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleListResult {
  list: Article[];
  total: number;
}

export interface QueryArticleParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface ArticleForm {
  title: string;
  content?: string;
  category?: ArticleCategory;
  status?: ArticleStatus;
}

/** 分页查询文章 */
export function getArticles(params: QueryArticleParams) {
  return request.get<unknown, ArticleListResult>('/articles', { params });
}

/** 创建文章 */
export function createArticle(data: ArticleForm) {
  return request.post<unknown, Article>('/articles', data);
}

/** 更新文章 */
export function updateArticle(id: number, data: ArticleForm) {
  return request.patch<unknown, Article>(`/articles/${id}`, data);
}

/** 删除文章 */
export function deleteArticle(id: number) {
  return request.delete<unknown, { id: number }>(`/articles/${id}`);
}
