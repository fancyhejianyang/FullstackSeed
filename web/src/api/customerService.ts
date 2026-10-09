import request from '@/utils/request';

export type CustomerServiceStatus = 'ai' | 'waiting_human' | 'human' | 'closed';
export type CustomerTaskStatus = 'queued' | 'running' | 'cancelling';

export interface CustomerServiceMessage {
  id: number;
  sessionId: number;
  role: 'user' | 'ai' | 'agent' | 'system';
  content: string;
  createdAt: string;
  agentName?: string | null;
  clientMessageId?: string | null;
  taskId?: number | null;
}

export interface CustomerServiceSession {
  sessionId: number;
  title: string;
  externalAppId: number | null;
  appName: string | null;
  serviceStatus: CustomerServiceStatus;
  serviceVersion: number;
  assignedAgentId: number | null;
  assignedAgentName: string | null;
  queuePosition: number | null;
  activeTask: { id: number; status: CustomerTaskStatus; answer: string } | null;
  updatedAt: string;
}

export interface CustomerServiceSnapshot extends CustomerServiceSession {
  messages: CustomerServiceMessage[];
  hasMoreMessages: boolean;
  nextBeforeMessageId: number | null;
}

export interface CustomerServiceListResult {
  list: CustomerServiceSession[];
  total: number;
}

export interface QueryCustomerServiceParams {
  page?: number;
  pageSize?: number;
  externalAppId?: number;
  serviceStatus?: CustomerServiceStatus;
  taskStatus?: 'queued' | 'running';
  mine?: boolean;
  keyword?: string;
}

const sessionPath = '/customer-service/admin/sessions';

export function getCustomerServiceSessions(params: QueryCustomerServiceParams) {
  return request.get<unknown, CustomerServiceListResult>(sessionPath, { params });
}

export function getCustomerServiceApps() {
  return request.get<unknown, Array<{ id: number; name: string }>>('/customer-service/admin/apps');
}

export function getCustomerServiceSession(id: number, beforeMessageId?: number) {
  return request.get<unknown, CustomerServiceSnapshot>(`${sessionPath}/${id}`, {
    params: beforeMessageId ? { beforeMessageId } : undefined,
  });
}

export function claimCustomerServiceSession(id: number) {
  return request.post<unknown, CustomerServiceSnapshot>(`${sessionPath}/${id}/claim`);
}

export function sendCustomerServiceMessage(id: number, data: { clientMessageId: string; content: string }) {
  return request.post<unknown, CustomerServiceSnapshot>(`${sessionPath}/${id}/messages`, data);
}

export function closeCustomerServiceSession(id: number) {
  return request.post<unknown, CustomerServiceSnapshot>(`${sessionPath}/${id}/close`);
}
