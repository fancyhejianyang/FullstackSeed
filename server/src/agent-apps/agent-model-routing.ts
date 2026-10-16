import { BadRequestException } from '@nestjs/common';

export const AGENT_MODEL_STRATEGIES = [
  'priority',
  'balanced',
  'intent',
] as const;
export interface AgentModelRouting {
  strategy: (typeof AGENT_MODEL_STRATEGIES)[number];
  simpleModels: string[];
  complexModels: string[];
  maxAttempts: number;
  attemptTimeoutSeconds: number;
  cooldownSeconds: number;
}
export interface AgentModelDecision {
  intent: 'chat' | 'query' | 'write' | 'analysis';
  complexity: 'simple' | 'complex';
  source: 'classifier' | 'fallback';
}
export interface AgentModelAttempt {
  purpose: 'routing' | 'planning' | 'answer';
  model: string;
  status: 'succeeded' | 'failed';
  reason: string | null;
  elapsedMilliseconds: number;
  totalTokens: number | null;
}
export interface AgentModelTrace {
  strategy: AgentModelRouting['strategy'];
  decision?: AgentModelDecision;
  attempts: AgentModelAttempt[];
}

export function normalizeModelRouting(
  value: Partial<AgentModelRouting> | null | undefined,
  models: string[],
): AgentModelRouting {
  const policy: AgentModelRouting = {
    strategy: value?.strategy ?? 'priority',
    simpleModels: value?.simpleModels ?? [],
    complexModels: value?.complexModels ?? [],
    maxAttempts: value?.maxAttempts ?? 8,
    attemptTimeoutSeconds: value?.attemptTimeoutSeconds ?? 20,
    cooldownSeconds: value?.cooldownSeconds ?? 60,
  };
  if (!AGENT_MODEL_STRATEGIES.includes(policy.strategy))
    throw new BadRequestException('模型调度策略无效');
  for (const group of [policy.simpleModels, policy.complexModels]) {
    if (
      !Array.isArray(group) ||
      group.some((m) => !models.includes(m)) ||
      new Set(group).size !== group.length
    )
      throw new BadRequestException(
        '调度模型组只能包含当前模型列表中的模型且不能重复',
      );
  }
  if (
    policy.strategy === 'intent' &&
    (!policy.simpleModels.length || !policy.complexModels.length)
  )
    throw new BadRequestException('按意图调度必须配置轻量和复杂任务模型组');
  for (const [value, min, max] of [
    [policy.maxAttempts, 3, 20],
    [policy.attemptTimeoutSeconds, 3, 120],
    [policy.cooldownSeconds, 5, 3600],
  ]) {
    if (!Number.isInteger(value) || value < min || value > max)
      throw new BadRequestException('模型调度次数或时间范围无效');
  }
  return policy;
}

export function parseModelDecision(text: string): AgentModelDecision {
  const value: unknown = JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, ''),
  );
  if (!value || typeof value !== 'object') throw new Error('无效任务识别');
  const d = value as Record<string, unknown>;
  if (
    typeof d.intent !== 'string' ||
    typeof d.complexity !== 'string' ||
    !['chat', 'query', 'write', 'analysis'].includes(d.intent) ||
    !['simple', 'complex'].includes(d.complexity)
  )
    throw new Error('无效任务识别');
  return {
    intent: d.intent as AgentModelDecision['intent'],
    complexity: d.complexity as AgentModelDecision['complexity'],
    source: 'classifier',
  };
}

/** 错误分类只用于调度，不把供应商原始响应/密钥信息写入调度轨迹。 */
export function modelFailureReason(message: string): string {
  if (/\b401\b|invalid.?api.?key|unauthorized|鉴权失败/i.test(message))
    return 'account_auth';
  if (/insufficient.?balance|arrears|欠费|余额不足/i.test(message))
    return 'account_balance';
  if (/context.{0,20}(length|window)|上下文|too many tokens/i.test(message))
    return 'context_length';
  if (
    /quota|额度|token.{0,20}(exhaust|limit)|exhaust.{0,20}token/i.test(message)
  )
    return 'quota';
  if (/\b429\b|rate.?limit|限流|too many requests/i.test(message))
    return 'rate_limit';
  if (/timeout|timed out|超时|aborted/i.test(message)) return 'timeout';
  if (/\b(?:403|404)\b|model.{0,20}(not found|not exist)/i.test(message))
    return 'model_unavailable';
  if (/invalid_model_output/i.test(message)) return 'invalid_output';
  return 'request_failed';
}
