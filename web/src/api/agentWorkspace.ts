import request from "@/utils/request";
import type { AgentBusinessToolOption, AgentToolKey } from "./agentApp";
import type { ProductSkuChatContext } from "./knowledgeAiChat";

export type AgentPendingActionStatus =
  | "collecting"
  | "pending_confirmation"
  | "submitting"
  | "submitted"
  | "cancelled"
  | "expired"
  | "failed";

export type AgentExecutionStatus =
  | "queued"
  | "running"
  | "waiting_input"
  | "waiting_confirmation"
  | "submitting"
  | "verifying"
  | "succeeded"
  | "failed"
  | "cancelled";

export type AgentExecutionToolKey =
  | "model.chat"
  | "knowledge.answer"
  | AgentToolKey;

export type AgentProgressStage =
  | "recognizing_image"
  | "generating_image"
  | "understanding"
  | "querying"
  | "retrieving"
  | "preparing_confirmation"
  | "generating"
  | "summarizing";

export interface AgentExecutionProgress {
  executionId: number;
  requestId: string;
  sessionId: number;
  status: AgentExecutionStatus;
  stage: AgentProgressStage | null;
  startedAt: string | null;
}

export interface AvailableAgentApp {
  mediaCapabilities: { vision: boolean; imageGeneration: boolean };
  id: number;
  name: string;
  responsibility: string;
  models: string[];
  toolKeys: AgentToolKey[];
  tools: AgentBusinessToolOption[];
  writeEnabled: boolean;
  maxToolCalls: number;
  timeoutSeconds: number;
}

export interface AgentSession {
  id: number;
  userId: number;
  userName: string;
  agentAppId: number;
  agentAppName: string;
  title: string;
  status: "active" | "stopped" | "closed";
  messageCount: number;
  lastMessage: string | null;
  lastExecutionStatus: AgentExecutionStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMessageStructuredData {
  mode?: AgentMessageMode;
  images?: AgentImageReference[];
  businessResult?: AgentBusinessQueryResult;
  action?: "answer" | "query" | "clarify" | "prepare_write";
  reason?: "write_not_executed" | "stale_lease";
  queryStatus?: "matched" | "not_matched";
  context?: ProductSkuChatContext | null;
  businessContext?: ProductSkuChatContext | null;
  pendingActionId?: number;
  pendingActionVersion?: number;
  candidateContext?: ProductSkuChatContext | null;
  recordId?: number;
  recordCode?: string;
  detailPath?: string;
  sourceNames?: string | null;
  retrievalHits?: Array<{
    key: string;
    title: string;
    sourceName: string;
    knowledgeBaseName: string;
  }>;
}

export interface AgentMessage {
  id: number;
  sessionId: number;
  userId: number;
  role: "user" | "assistant" | "system";
  messageType:
    | "text"
    | "query_result"
    | "pending_action"
    | "receipt"
    | "status"
    | "error";
  content: string;
  structuredData: AgentMessageStructuredData | null;
  executionId: number | null;
  clientMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSkuPendingActionData extends Record<string, unknown> {
  productId: number | null;
  productName: string;
  skuCode: string;
  name: string;
  specifications: Record<string, unknown>;
  isEnabled: boolean;
}

export interface AgentBusinessField {
  prop: string;
  label: string;
  type: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maxLength?: number;
  options?: { label: string; value: number | string }[];
}
export interface AgentBusinessForm {
  name: string;
  permission: string;
  detailPath: string;
  note: string;
  fields: AgentBusinessField[];
}
export interface AgentBusinessQueryResult {
  toolKey: string;
  name: string;
  fields: { prop: string; label: string }[];
  list: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  detailPath: string;
}

export interface AgentPendingAction {
  id: number;
  sessionId: number;
  userId: number;
  agentAppId: number;
  toolKey: string;
  status: AgentPendingActionStatus;
  version: number;
  data: Record<string, unknown>;
  form?: AgentBusinessForm;
  missingFields: string[];
  validationErrors: string[];
  submittedRecordId: number | null;
  lastExecutionId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentExecution {
  id: number;
  requestId: string;
  sessionId: number;
  userId: number;
  agentAppId: number;
  messageId: number | null;
  pendingActionId: number | null;
  toolKey: AgentExecutionToolKey;
  status: AgentExecutionStatus;
  parameterSummary:
    | (Record<string, unknown> & { modelRouting?: AgentModelTrace })
    | null;
  result: Record<string, unknown> | null;
  configSnapshot: Record<string, unknown> | null;
  configVersion: string | null;
  errorMessage: string | null;
  statusReason: string | null;
  failureStage: string | null;
  toolCallCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  modelCallDurationMs: number | null;
  startedAt: string | null;
  heartbeatAt: string | null;
  leaseExpiresAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  elapsedMilliseconds?: number | null;
}

export interface AgentModelTrace {
  strategy: "priority" | "balanced" | "intent" | "fixed";
  selectedModel?: string;
  decision?: {
    intent: "chat" | "query" | "write" | "analysis";
    complexity: "simple" | "complex";
    source: "classifier" | "fallback";
  };
  attempts: Array<{
    purpose: "routing" | "planning" | "answer";
    model: string;
    status: "succeeded" | "failed";
    reason: string | null;
    elapsedMilliseconds: number;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  }>;
}

// 管理列表只返回标量字段；模型轨迹和 JSON 载荷通过详情接口按需获取。
export type AgentExecutionRecord = Pick<
  AgentExecution,
  | "id"
  | "requestId"
  | "sessionId"
  | "userId"
  | "agentAppId"
  | "toolKey"
  | "status"
  | "statusReason"
  | "totalTokens"
  | "modelCallDurationMs"
  | "startedAt"
  | "finishedAt"
  | "createdAt"
> & { elapsedMilliseconds: number | null };

export interface AgentSessionDetail extends AgentSession {
  messages: AgentMessage[];
  messageTotal: number;
  pendingActions: AgentPendingAction[];
  executions: AgentExecution[];
}

export interface AgentSessionListResult {
  list: AgentSession[];
  total: number;
}

export interface AgentMessageListResult {
  list: AgentMessage[];
  total: number;
}

export interface AgentActionResult {
  session?: AgentSession;
  userMessage?: AgentMessage;
  assistantMessage?: AgentMessage | null;
  execution: AgentExecution;
  pendingAction?: AgentPendingAction | null;
}

export function getAvailableAgentApps() {
  return request.get<unknown, AvailableAgentApp[]>("/agent-workspace/apps");
}

export function getAgentSessions(params: {
  page?: number;
  pageSize?: number;
  agentAppId?: number;
  keyword?: string;
}) {
  return request.get<unknown, AgentSessionListResult>(
    "/agent-workspace/sessions",
    {
      params,
    },
  );
}

export function createAgentSession(data: {
  agentAppId: number;
  title?: string;
}) {
  return request.post<unknown, AgentSession>("/agent-workspace/sessions", data);
}

export function getAgentSession(id: number) {
  return request.get<unknown, AgentSessionDetail>(
    `/agent-workspace/sessions/${id}`,
  );
}

export function getAgentSessionMessages(
  id: number,
  params: { beforeId?: number; pageSize?: number },
) {
  return request.get<unknown, AgentMessageListResult>(
    `/agent-workspace/sessions/${id}/messages`,
    { params },
  );
}

export function sendAgentMessage(
  sessionId: number,
  data: {
    content: string;
    clientMessageId: string;
    imageId?: number;
    textModel?: string;
  },
) {
  return request.post<unknown, AgentActionResult>(
    `/agent-workspace/sessions/${sessionId}/messages`,
    data,
    { timeout: 310000 },
  );
}

export type AgentMessageMode = "chat" | "vision" | "imageGeneration";
export interface AgentImageReference {
  id: number;
  mimeType: string;
  size: number;
  source: "upload" | "generated";
}

export function uploadAgentImage(sessionId: number, file: File) {
  const data = new FormData();
  data.append("file", file);
  return request.post<unknown, AgentImageReference>(
    `/agent-workspace/sessions/${sessionId}/images`,
    data,
    { timeout: 60000 },
  );
}
export function getAgentImage(sessionId: number, imageId: number) {
  return request.get<unknown, Blob>(
    `/agent-workspace/sessions/${sessionId}/images/${imageId}`,
    { responseType: "blob", silentError: true },
  );
}

export function updateAgentPendingAction(
  id: number,
  data: { version: number; data: Record<string, unknown> },
) {
  return request.patch<unknown, AgentPendingAction>(
    `/agent-workspace/pending-actions/${id}`,
    data,
  );
}

export function confirmAgentPendingAction(
  id: number,
  data: { version: number; idempotencyKey: string },
) {
  return request.post<unknown, AgentActionResult>(
    `/agent-workspace/pending-actions/${id}/confirm`,
    data,
    { timeout: 310000 },
  );
}

export function cancelAgentPendingAction(id: number) {
  return request.post<unknown, AgentPendingAction>(
    `/agent-workspace/pending-actions/${id}/cancel`,
  );
}

export function getAgentExecution(id: number) {
  return request.get<unknown, AgentExecution>(
    `/agent-workspace/executions/${id}`,
  );
}

export function getAgentExecutionByRequest(requestId: string) {
  return request.get<unknown, AgentExecution>(
    `/agent-workspace/executions/request/${encodeURIComponent(requestId)}`,
  );
}

export function getAgentExecutionProgress(requestId: string) {
  return request.get<unknown, AgentExecutionProgress | null>(
    `/agent-workspace/executions/progress/${encodeURIComponent(requestId)}`,
    { timeout: 5000, silentError: true },
  );
}

export function stopAgentExecution(id: number) {
  return request.post<unknown, AgentExecution>(
    `/agent-workspace/executions/${id}/stop`,
  );
}

export function getAgentExecutionRecords(params: {
  page?: number;
  pageSize?: number;
  agentAppId?: number;
  userId?: number;
  status?: AgentExecutionStatus | "";
  keyword?: string;
}) {
  return request.get<unknown, { list: AgentExecutionRecord[]; total: number }>(
    "/agent-apps/execution-records",
    { params },
  );
}

export function getAgentExecutionRecord(id: number) {
  return request.get<unknown, AgentExecution>(
    `/agent-apps/execution-records/${id}`,
  );
}
