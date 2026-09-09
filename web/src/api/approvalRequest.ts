import request from '@/utils/request';

export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';
export type ApprovalBusinessType = 'standardQa';

export interface ApprovalRequest {
  id: number;
  businessType: ApprovalBusinessType;
  businessId: number;
  businessTitle: string;
  status: ApprovalRequestStatus;
  applicantId: number;
  applicantName: string;
  submittedAt: string;
  reviewerId: number | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  remark: string | null;
  contentSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRequestListResult {
  list: ApprovalRequest[];
  total: number;
}

export interface QueryApprovalRequestParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: ApprovalRequestStatus | '';
  businessType?: ApprovalBusinessType | '';
}

export const approvalRequestStatusOptions = [
  { label: '待审批', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
] as const;

export function getApprovalRequests(params: QueryApprovalRequestParams) {
  return request.get<unknown, ApprovalRequestListResult>('/approval-requests', { params });
}

export function getApprovalRequest(id: number) {
  return request.get<unknown, ApprovalRequest>(`/approval-requests/${id}`);
}

export function submitStandardQaApproval(id: number) {
  return request.post<unknown, ApprovalRequest>(
    `/approval-requests/standard-qas/${id}/submit`,
  );
}

export function approveApprovalRequest(id: number, remark?: string) {
  return request.post<unknown, ApprovalRequest>(`/approval-requests/${id}/approve`, {
    remark,
  });
}

export function rejectApprovalRequest(id: number, remark: string) {
  return request.post<unknown, ApprovalRequest>(`/approval-requests/${id}/reject`, {
    remark,
  });
}
