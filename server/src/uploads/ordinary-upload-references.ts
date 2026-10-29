/** Business persistence guards and delayed cleanup use the same contract. */
export const ORDINARY_UPLOAD_REFERENCE_FIELDS: Record<
  string,
  readonly string[]
> = {
  demo: ['imageUrl', 'attachmentUrl', 'content'],
  knowledge_bases: ['fileUrl', 'contentText'],
  knowledge_base_documents: ['content'],
  knowledge_base_chunks: ['content'],
  content_articles: ['coverUrl', 'content'],
  content_generation_tasks: ['snapshot', 'result', 'coverData'],
};
