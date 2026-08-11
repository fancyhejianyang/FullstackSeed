import request from '@/utils/request';
import { DEMO_CATEGORY, DEMO_STATUS, DEMO_TAG } from '@/dic';

/** 示例分类值（与后端 demo.constants.ts 保持一致） */
export type DemoCategory = (typeof DEMO_CATEGORY.items)[number]['value'];

/** 示例状态值（与后端 demo.constants.ts 保持一致） */
export type DemoStatus = (typeof DEMO_STATUS.items)[number]['value'];
export type DemoTag = (typeof DEMO_TAG.items)[number]['value'];

export interface Demo {
  id: number;
  title: string;
  content: string;
  category: DemoCategory;
  status: DemoStatus;
  contactPhone: string;
  email: string;
  quantity: number;
  unitPrice: number;
  budgetAmount: number;
  isFeatured: boolean;
  tags: DemoTag[];
  imageUrl: string;
  attachmentName: string;
  attachmentUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemoListResult {
  list: Demo[];
  total: number;
}

export interface QueryDemoParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface DemoForm {
  title: string;
  content?: string;
  category?: DemoCategory;
  status?: DemoStatus;
  contactPhone?: string;
  email?: string;
  quantity?: number;
  unitPrice?: number;
  budgetAmount?: number;
  isFeatured?: boolean;
  tags?: DemoTag[];
  imageUrl?: string;
  attachmentName?: string;
  attachmentUrl?: string;
}

/** 分页查询示例 */
export function getDemos(params: QueryDemoParams) {
  return request.get<unknown, DemoListResult>('/demo', { params });
}

/** 示例详情（编辑/查看态取最新数据） */
export function getDemo(id: number) {
  return request.get<unknown, Demo>(`/demo/${id}`);
}

/** 创建示例 */
export function createDemo(data: DemoForm) {
  return request.post<unknown, Demo>('/demo', data);
}

/** 更新示例 */
export function updateDemo(id: number, data: DemoForm) {
  return request.patch<unknown, Demo>(`/demo/${id}`, data);
}

/** 删除示例 */
export function deleteDemo(id: number) {
  return request.delete<unknown, { id: number }>(`/demo/${id}`);
}

/** 批量删除示例 */
export function batchDeleteDemos(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>('/demo/batch-delete', {
    ids: ids.map(Number),
  });
}
