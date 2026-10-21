import request from "@/utils/request";
import type { VisualPromptTask } from "@/api/visualPromptTemplate";

export type PageResult<T> = { list: T[]; total: number };
export type ComfyOutputType = "image" | "video";
export type ComfyBindingType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "image"
  | "seed"
  | "outputPrefix";
export type ComfyBindingSemanticRole =
  | "normal"
  | "positivePrompt"
  | "negativePrompt"
  | "videoMotion"
  | "cameraMotion";

export interface ComfyConnection {
  id: number;
  name: string;
  baseUrl: string;
  authType: "none" | "basic" | "bearer";
  username: string | null;
  secretConfigured?: boolean;
  requestTimeoutMs: number;
  taskTimeoutSec: number;
  maxConcurrency: number;
  isEnabled: boolean;
  isDefault: boolean;
  lastTestStatus: "untested" | "available" | "unavailable";
  lastTestedAt: string | null;
  lastTestMessage: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ComfyConnectionForm = Omit<
  ComfyConnection,
  | "id"
  | "secretConfigured"
  | "lastTestStatus"
  | "lastTestedAt"
  | "lastTestMessage"
  | "createdAt"
  | "updatedAt"
> & {
  secret?: string;
  clearSecret?: boolean;
};

export interface ComfyBindingOption {
  label: string;
  value: string | number;
}

export interface ComfyInputBinding {
  key: string;
  label: string;
  type: ComfyBindingType;
  nodeId: string;
  inputKey: string;
  semanticRole?: ComfyBindingSemanticRole;
  required?: boolean;
  defaultValue?: string | number | boolean | null;
  min?: number;
  max?: number;
  options?: ComfyBindingOption[];
  hint?: string;
}

export interface ComfyWorkflow {
  id: number;
  name: string;
  connectionId: number;
  connectionName?: string;
  outputType: ComfyOutputType;
  targetModel: string | null;
  visualPromptTemplateId: number | null;
  description: string | null;
  apiWorkflow?: string;
  inputBindings: ComfyInputBinding[];
  bindingCount?: number;
  outputNodeIds: string[] | null;
  dependencyNotes: string | null;
  version: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ComfyWorkflowForm = Omit<
  ComfyWorkflow,
  | "id"
  | "connectionName"
  | "bindingCount"
  | "visualPromptTemplateId"
  | "version"
  | "createdAt"
  | "updatedAt"
> & { apiWorkflow: string };

export interface ComfyWorkflowOption {
  id: number;
  name: string;
  outputType: ComfyOutputType;
  targetModel: string | null;
  visualPromptTemplateId: number | null;
  description: string | null;
  version: number;
  inputBindings: ComfyInputBinding[];
}

export interface ComfyMaterial {
  id: number;
  name: string;
  sourceType: "input" | "output";
  mediaType: "image" | "video" | "file";
  fileId: number | null;
  fileUrl: string | null;
  mimeType: string | null;
  size: number;
  sourceTaskId: number | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ComfyTaskStatus =
  | "pending"
  | "submitting"
  | "queued"
  | "running"
  | "archiving"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "unknown";

export interface ComfyTaskOutput {
  id: number;
  taskId: number;
  materialId: number;
  fileId: number;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  nodeId: string | null;
}

export interface ComfyTask {
  id: number;
  workflowId: number;
  workflowVersionId: number;
  connectionId: number;
  requestId: string;
  outputType: ComfyOutputType;
  status: ComfyTaskStatus;
  stage: string;
  progress: number | null;
  parameterSnapshot?: Record<string, unknown>;
  promptId: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  workflowName?: string;
  outputs?: ComfyTaskOutput[];
  createdAt: string;
  updatedAt: string;
}

export function getComfyConnections(params: Record<string, unknown>) {
  return request.get<unknown, PageResult<ComfyConnection>>(
    "/comfyui/connections",
    { params },
  );
}
export function getComfyConnection(id: number) {
  return request.get<unknown, ComfyConnection>(`/comfyui/connections/${id}`);
}
export function getComfyConnectionOptions() {
  return request.get<
    unknown,
    Pick<ComfyConnection, "id" | "name" | "isDefault" | "lastTestStatus">[]
  >("/comfyui/connections/options");
}
export function createComfyConnection(data: ComfyConnectionForm) {
  return request.post<unknown, ComfyConnection>("/comfyui/connections", data);
}
export function updateComfyConnection(
  id: number,
  data: Partial<ComfyConnectionForm>,
) {
  return request.patch<unknown, ComfyConnection>(
    `/comfyui/connections/${id}`,
    data,
  );
}
export function testComfyConnection(id: number) {
  return request.post<unknown, { status: string }>(
    `/comfyui/connections/${id}/test`,
  );
}
export function deleteComfyConnection(id: number) {
  return request.delete(`/comfyui/connections/${id}`);
}
export function batchDeleteComfyConnections(ids: number[]) {
  return request.delete("/comfyui/connections/batch", { data: { ids } });
}

export function getComfyWorkflows(params: Record<string, unknown>) {
  return request.get<unknown, PageResult<ComfyWorkflow>>("/comfyui/workflows", {
    params,
  });
}
export function getComfyWorkflow(id: number) {
  return request.get<unknown, ComfyWorkflow>(`/comfyui/workflows/${id}`);
}
export function getComfyWorkflowOptions() {
  return request.get<unknown, ComfyWorkflowOption[]>(
    "/comfyui/workflows/options",
  );
}
export function createComfyWorkflow(data: ComfyWorkflowForm) {
  return request.post<unknown, ComfyWorkflow>("/comfyui/workflows", data);
}
export function updateComfyWorkflow(
  id: number,
  data: Partial<ComfyWorkflowForm>,
) {
  return request.patch<unknown, ComfyWorkflow>(
    `/comfyui/workflows/${id}`,
    data,
  );
}
export function composeComfyWorkflowPrompt(
  id: number,
  data: { idea: string; requestId: string },
) {
  return request.post<unknown, VisualPromptTask>(
    `/comfyui/workflows/${id}/compose-prompt`,
    data,
  );
}
export function getComfyWorkflowPromptTask(taskId: number) {
  return request.get<unknown, VisualPromptTask>(
    `/comfyui/workflows/compose-tasks/${taskId}`,
  );
}
export function deleteComfyWorkflow(id: number) {
  return request.delete(`/comfyui/workflows/${id}`);
}
export function batchDeleteComfyWorkflows(ids: number[]) {
  return request.delete("/comfyui/workflows/batch", { data: { ids } });
}

export function getComfyMaterials(params: Record<string, unknown>) {
  return request.get<unknown, PageResult<ComfyMaterial>>("/comfyui/materials", {
    params,
  });
}
export function getComfyMaterialOptions() {
  return request.get<unknown, ComfyMaterial[]>("/comfyui/materials/options");
}
export function uploadComfyMaterial(file: File, name?: string) {
  const data = new FormData();
  data.append("file", file);
  if (name?.trim()) data.append("name", name.trim());
  return request.post<unknown, ComfyMaterial>(
    "/comfyui/materials/upload",
    data,
  );
}
export function updateComfyMaterial(
  id: number,
  data: { name?: string; isFavorite?: boolean },
) {
  return request.patch<unknown, ComfyMaterial>(
    `/comfyui/materials/${id}`,
    data,
  );
}
export function deleteComfyMaterial(id: number) {
  return request.delete(`/comfyui/materials/${id}`);
}
export function batchDeleteComfyMaterials(ids: number[]) {
  return request.delete("/comfyui/materials/batch", { data: { ids } });
}

export function getComfyTasks(params: Record<string, unknown>) {
  return request.get<unknown, PageResult<ComfyTask>>("/comfyui/tasks", {
    params,
  });
}
export function getComfyTask(id: number) {
  return request.get<unknown, ComfyTask>(`/comfyui/tasks/${id}`);
}
export function createComfyTask(data: {
  workflowId: number;
  parameters: Record<string, unknown>;
  requestId?: string;
}) {
  return request.post<unknown, ComfyTask>("/comfyui/tasks", data);
}
export function cancelComfyTask(id: number) {
  return request.post<unknown, ComfyTask>(`/comfyui/tasks/${id}/cancel`);
}
export function deleteComfyTask(id: number) {
  return request.delete(`/comfyui/tasks/${id}`);
}
export function batchDeleteComfyTasks(ids: number[]) {
  return request.delete("/comfyui/tasks/batch", { data: { ids } });
}
