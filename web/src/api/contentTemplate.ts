import request from '@/utils/request';

export interface ContentTemplateForm {
  name: string;
  instruction: string;
}
export interface ContentTemplate extends ContentTemplateForm {
  id: number;
  updatedAt: string;
}
export type ContentTemplateSummary = Pick<
  ContentTemplate,
  'id' | 'name' | 'updatedAt'
>;
export function getContentTemplates(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
}) {
  return request.get<
    unknown,
    { list: ContentTemplateSummary[]; total: number }
  >('/content-templates', { params });
}
export function getContentTemplate(id: number) {
  return request.get<unknown, ContentTemplate>(`/content-templates/${id}`);
}
export function createContentTemplate(data: ContentTemplateForm) {
  return request.post<unknown, ContentTemplate>('/content-templates', data);
}
export function updateContentTemplate(id: number, data: ContentTemplateForm) {
  return request.patch<unknown, ContentTemplate>(
    `/content-templates/${id}`,
    data,
  );
}
export function deleteContentTemplate(id: number) {
  return request.delete(`/content-templates/${id}`);
}
export function batchDeleteContentTemplates(ids: Array<string | number>) {
  return request.post('/content-templates/batch-delete', {
    ids: ids.map(Number),
  });
}
