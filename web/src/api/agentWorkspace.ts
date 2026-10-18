import request from "@/utils/request";
import type { AgentBusinessToolOption, AgentToolKey } from "./agentApp";
import type { ProductSkuChatContext } from "./knowledgeAiChat";

export type AgentDraftStatus =
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
  | "preparing_draft"
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
  reason?: "write_not_executed";
  queryStatus?: "matched" | "not_matched";
  context?: ProductSkuChatContext | null;
  businessContext?: ProductSkuChatContext | null;
  draftId?: number;
  draftVersion?: number;
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
    | "draft"
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

export interface AgentSkuDraftData extends Record<string, unknown> {
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

export interface AgentDraft {
  id: number;
  sessionId: number;
  userId: number;
  agentAppId: number;
  toolKey: string;
  status: AgentDraftStatus;
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
  draftId: number | null;
  toolKey: AgentExecutionToolKey;
  status: AgentExecutionStatus;
  parameterSummary:
    | (Record<string, unknown> & { modelRouting?: AgentModelTrace })
    | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  toolCallCount: number;
  startedAt: string | null;
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
    totalTokens: number | null;
  }>;
}

export interface AgentSessionDetail extends AgentSession {
  messages: AgentMessage[];
  drafts: AgentDraft[];
  executions: AgentExecution[];
}

export interface AgentSessionListResult {
  list: AgentSession[];
  total: number;
}

export interface AgentActionResult {
  session?: AgentSession;
  userMessage?: AgentMessage;
  assistantMessage?: AgentMessage | null;
  execution: AgentExecution;
  draft?: AgentDraft | null;
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

export function updateAgentDraft(
  id: number,
  data: { version: number; data: Record<string, unknown> },
) {
  return request.patch<unknown, AgentDraft>(
    `/agent-workspace/drafts/${id}`,
    data,
  );
}

export function confirmAgentDraft(
  id: number,
  data: { version: number; idempotencyKey: string },
) {
  return request.post<unknown, AgentActionResult>(
    `/agent-workspace/drafts/${id}/confirm`,
    data,
    { timeout: 310000 },
  );
}

export function cancelAgentDraft(id: number) {
  return request.post<unknown, AgentDraft>(
    `/agent-workspace/drafts/${id}/cancel`,
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
  return request.get<unknown, { list: AgentExecution[]; total: number }>(
    "/agent-apps/execution-records",
    { params },
  );
}
