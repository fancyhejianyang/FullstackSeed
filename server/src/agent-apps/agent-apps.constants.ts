export const AGENT_TOOL_KEYS = [
  'knowledge.answer',
  'product.query',
  'productSku.create',
] as const;

export type AgentToolKey = (typeof AGENT_TOOL_KEYS)[number];

export const AGENT_ACCESS_SCOPES = ['all', 'users'] as const;
export type AgentAccessScope = (typeof AGENT_ACCESS_SCOPES)[number];

export const AGENT_SESSION_STATUSES = ['active', 'stopped', 'closed'] as const;
export type AgentSessionStatus = (typeof AGENT_SESSION_STATUSES)[number];

export const AGENT_MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;
export type AgentMessageRole = (typeof AGENT_MESSAGE_ROLES)[number];

export const AGENT_MESSAGE_TYPES = [
  'text',
  'query_result',
  'draft',
  'receipt',
  'status',
  'error',
] as const;
export type AgentMessageType = (typeof AGENT_MESSAGE_TYPES)[number];

export const AGENT_ACTION_TYPES = [
  'answer',
  'query',
  'clarify',
  'prepare_write',
] as const;
export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number];

export const AGENT_DRAFT_STATUSES = [
  'collecting',
  'pending_confirmation',
  'submitting',
  'submitted',
  'cancelled',
  'expired',
  'failed',
] as const;
export type AgentDraftStatus = (typeof AGENT_DRAFT_STATUSES)[number];

export const AGENT_EXECUTION_STATUSES = [
  'queued',
  'running',
  'waiting_input',
  'waiting_confirmation',
  'submitting',
  'verifying',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type AgentExecutionStatus = (typeof AGENT_EXECUTION_STATUSES)[number];

export const AGENT_EXECUTION_ACTIVE_STATUSES: AgentExecutionStatus[] = [
  'queued',
  'running',
  'submitting',
  'verifying',
];

export interface AgentSkuDraftData {
  productId: number | null;
  productName: string;
  skuCode: string;
  name: string;
  specifications: Record<string, unknown>;
  isEnabled: boolean;
}
