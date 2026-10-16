import { AI_BUSINESS_COMMAND_CATALOG } from '../ai-command-definitions/ai-command-definitions.constants';

/**
 * `product.query` 是工作台现有的产品/SKU 聚合查询能力；其余工具直接来自
 * 指令集业务目录，避免每新增一个业务指令都要再维护 Agent 白名单。
 */
export const AGENT_TOOL_KEYS = Array.from(
  new Set([
    'product.query',
    ...AI_BUSINESS_COMMAND_CATALOG.filter((item) => item.chatCallable).map(
      (item) => item.commandKey,
    ),
  ]),
);

/** 只有已经接入工作台执行器的工具才可以配置执行；指令目录登记不等于可调用。 */
export const AGENT_RUNTIME_TOOL_KEYS: readonly string[] = [
  'product.query',
  'productSku.create',
];

export const AGENT_WRITE_TOOL_KEYS = AI_BUSINESS_COMMAND_CATALOG.filter(
  (item) => item.chatCallable && item.requireApproval,
).map((item) => item.commandKey);

export type AgentToolKey = string;

export const AGENT_EXECUTION_TOOL_KEYS = [
  'model.chat',
  'knowledge.answer',
  ...AGENT_TOOL_KEYS,
] as const;

export type AgentExecutionToolKey = (typeof AGENT_EXECUTION_TOOL_KEYS)[number];

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
