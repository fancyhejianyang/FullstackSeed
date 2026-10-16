import { BadRequestException } from '@nestjs/common';

export interface AgentBusinessPlan {
  kind: 'tool' | 'answer' | 'clarify';
  toolKey?: string;
  parameters: Record<string, unknown>;
  message?: string;
}

/** 模型只提交建议，不能指定执行地址、替换权限或调用任意方法。 */
export function parseAgentBusinessPlan(
  text: string,
  allowedKeys: string[],
): AgentBusinessPlan {
  let value: unknown;
  try {
    value = JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, ''),
    ) as unknown;
  } catch {
    throw new BadRequestException(
      '未能识别业务动作，请明确要查询或新增的模块和内容；未执行写入',
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('业务动作格式无效');
  const plan = value as Record<string, unknown>;
  if (plan.kind === 'answer') return { kind: 'answer', parameters: {} };
  if (plan.kind === 'clarify')
    return {
      kind: 'clarify',
      parameters: {},
      message:
        typeof plan.message === 'string'
          ? plan.message.slice(0, 1000)
          : '请明确业务模块、操作和需要处理的内容。',
    };
  if (
    plan.kind !== 'tool' ||
    typeof plan.toolKey !== 'string' ||
    !allowedKeys.includes(plan.toolKey)
  )
    throw new BadRequestException('模型选择了未授权业务工具，本次未执行');
  if (
    !plan.parameters ||
    typeof plan.parameters !== 'object' ||
    Array.isArray(plan.parameters)
  )
    throw new BadRequestException('业务参数格式无效');
  return {
    kind: 'tool',
    toolKey: plan.toolKey,
    parameters: plan.parameters as Record<string, unknown>,
  };
}
