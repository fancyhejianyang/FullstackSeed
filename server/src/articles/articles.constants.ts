/** 文章分类 */
export const ARTICLE_CATEGORIES = ['original', 'reprint', 'translation'] as const;
export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

/** 文章状态 */
export const ARTICLE_STATUSES = ['draft', 'published'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];
