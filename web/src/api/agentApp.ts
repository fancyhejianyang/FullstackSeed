import request from "@/utils/request";

export type AgentToolKey = string;
export type AgentAccessScope = "all" | "users";

export interface AgentBusinessToolOption {
  commandKey: AgentToolKey;
  name: string;
  action: "read" | "create" | "update" | "delete" | "execute";
  requireApproval: boolean;
  description: string | null;
}

export interface AgentApp {
  id: number;
  name: string;
  responsibility: string;
  instructionMarkdown: string;
  providerId: number;
  providerName: string;
  models: string[];
  toolKeys: AgentToolKey[];
  accessScope: AgentAccessScope;
  allowedUserIds: number[] | null;
  isEnabled: boolean;
  writeEnabled: boolean;
  maxToolCalls: number;
  timeoutSeconds: number;
  maxConcurrentRuns: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentAppForm {
  name: string;
  responsibility: string;
  instructionMarkdown: string;
  providerId: number | null;
  models: string[];
  toolKeys: AgentToolKey[];
  accessScope: AgentAccessScope;
  allowedUserIds: number[];
  isEnabled: boolean;
  writeEnabled: boolean;
  maxToolCalls: number;
  timeoutSeconds: number;
  maxConcurrentRuns: number;
}

export interface QueryAgentAppParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  isEnabled?: boolean | "";
}

export interface AgentAppListResult {
  list: AgentApp[];
  total: number;
}

export interface AgentConfigurationOptions {
  providers: Array<{
    id: number;
    name: string;
    models: Array<{ value: string; text: string }>;
  }>;
  businessTools: AgentBusinessToolOption[];
}

export function getAgentApps(params: QueryAgentAppParams) {
  return request.get<unknown, AgentAppListResult>("/agent-apps", { params });
}

export function getAgentApp(id: number) {
  return request.get<unknown, AgentApp>(`/agent-apps/${id}`);
}

export function getAgentConfigurationOptions() {
  return request.get<unknown, AgentConfigurationOptions>(
    "/agent-apps/configuration-options",
  );
}

export function createAgentApp(data: AgentAppForm) {
  return request.post<unknown, AgentApp>("/agent-apps", data);
}

export function updateAgentApp(id: number, data: AgentAppForm) {
  return request.patch<unknown, AgentApp>(`/agent-apps/${id}`, data);
}

export function deleteAgentApp(id: number) {
  return request.delete<unknown, { id: number }>(`/agent-apps/${id}`);
}

export function batchDeleteAgentApps(ids: Array<string | number>) {
  return request.post<unknown, { ids: number[] }>("/agent-apps/batch-delete", {
    ids: ids.map(Number),
  });
}
