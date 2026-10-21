/** 提交文章时固化的参考资料；AI 摘要不得冒充原文或已经核实的新闻事实。 */
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
export interface ContentArticleOrigin {
  topicId: number;
  materials: ContentSourceMaterial[];
}
