import type { AgentExecutionStatus } from './agent-apps.constants';

export const AGENT_PROGRESS_STAGES = [
  'understanding',
  'querying',
  'retrieving',
  'preparing_draft',
  'generating',
  'summarizing',
] as const;
export type AgentProgressStage = (typeof AGENT_PROGRESS_STAGES)[number];

/** 对外只暴露阶段码，不暴露模型思维链、提示词或检索配置。 */
export interface AgentExecutionProgress {
  executionId: number;
  requestId: string;
  sessionId: number;
  status: AgentExecutionStatus;
  stage: AgentProgressStage | null;
  startedAt: Date | null;
}

export function knowledgeStageToAgentProgress(
  name: string,
): AgentProgressStage {
  if (name === '业务数据查询') return 'querying';
  if (name === '模型生成回答' || name === '返回标准答案') return 'generating';
  if (name === '回答依据摘要') return 'summarizing';
  if (
    [
      '原问题标准问答匹配',
      '校准后标准问答匹配',
      '知识库检索',
      '知识库路由',
      '文本与向量召回',
      '候选资料重排',
      '候选资料筛选（重排关闭）',
    ].includes(name)
  )
    return 'retrieving';
  return 'understanding';
}
