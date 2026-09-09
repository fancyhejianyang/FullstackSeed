export const AI_COMMAND_ACTIONS = [
  'read',
  'create',
  'update',
  'delete',
  'execute',
] as const;

export type AiCommandAction = (typeof AI_COMMAND_ACTIONS)[number];

export const AI_COMMAND_EXECUTION_MODES = ['service', 'api'] as const;

export type AiCommandExecutionMode =
  (typeof AI_COMMAND_EXECUTION_MODES)[number];

export interface AiCommandCatalogItem {
  commandKey: string;
  name: string;
  action: AiCommandAction;
  executionMode: AiCommandExecutionMode;
  handlerKey: string;
  executionTarget: string;
  apiMethod: string;
  apiPath: string;
  requestSchema: string;
  contextBindings: string;
  chatCallable: boolean;
  requireApproval: boolean;
  semanticKeywords: string[];
  description: string;
}

const toJson = (value: unknown) => JSON.stringify(value, null, 2);

/**
 * 该目录是唯一可执行白名单。数据库记录只负责管理语义与启停，
 * 不允许将指令映射到目录以外的 URL 或服务方法。
 */
export const AI_COMMAND_CATALOG: AiCommandCatalogItem[] = [
  {
    commandKey: 'question.analyze',
    name: '问题拆解',
    action: 'execute',
    executionMode: 'service',
    handlerKey: 'question.analyze',
    executionTarget: 'KnowledgeAiChatCommandService.analyzeQuestion',
    apiMethod: 'POST',
    apiPath: 'service://question-analysis',
    requestSchema: toJson({
      type: 'object',
      required: ['question'],
      properties: {
        question: { type: 'string' },
        previousQuestion: { type: 'string' },
      },
    }),
    contextBindings: toJson({
      providerId: '$chat.providerId',
      model: '$chat.model',
    }),
    chatCallable: true,
    requireApproval: false,
    semanticKeywords: ['问题拆解', '意图识别', '关键词提取'],
    description: '将当前问题整理为结构化检索条件，不生成最终答案。',
  },
  {
    commandKey: 'qa.search',
    name: '标准问答查询',
    action: 'read',
    executionMode: 'service',
    handlerKey: 'qa.search',
    executionTarget: 'KnowledgeStandardQasService.matchForChat',
    apiMethod: 'POST',
    apiPath: 'service://knowledge-standard-qas/match',
    requestSchema: toJson({
      type: 'object',
      required: ['analysis'],
      properties: {
        analysis: { type: 'object' },
        retrievalConfigId: { type: 'integer' },
      },
    }),
    contextBindings: toJson({
      retrievalConfigId: '$chat.retrievalConfigId',
      status: 'published',
    }),
    chatCallable: true,
    requireApproval: false,
    semanticKeywords: ['标准问答', '固定答案', 'FAQ', '常见问题'],
    description: '仅在当前应用范围内查询已发布且有效的标准问答。',
  },
  {
    commandKey: 'knowledge.retrieve',
    name: '知识库检索',
    action: 'read',
    executionMode: 'service',
    handlerKey: 'knowledge.retrieve',
    executionTarget: 'KnowledgeAiChatRetrievalService.buildReferenceResult',
    apiMethod: 'POST',
    apiPath: 'service://knowledge-retrieval',
    requestSchema: toJson({
      type: 'object',
      required: ['question', 'retrievalConfigId'],
      properties: {
        question: { type: 'string' },
        retrievalConfigId: { type: 'integer' },
      },
    }),
    contextBindings: toJson({
      sessionId: '$chat.sessionId',
      appId: '$chat.appId',
    }),
    chatCallable: true,
    requireApproval: false,
    semanticKeywords: ['知识库', '文档检索', '资料查询'],
    description: '按当前应用、会话和路由范围检索知识库资料。',
  },
  {
    commandKey: 'session.context.read',
    name: '会话上下文读取',
    action: 'read',
    executionMode: 'service',
    handlerKey: 'session.context.read',
    executionTarget: 'KnowledgeAiChatService.getSessionHistory',
    apiMethod: 'GET',
    apiPath: 'service://ai-chat-sessions/{sessionId}/context',
    requestSchema: toJson({
      type: 'object',
      required: ['sessionId'],
      properties: { sessionId: { type: 'integer' } },
    }),
    contextBindings: toJson({ sessionId: '$chat.sessionId' }),
    chatCallable: false,
    requireApproval: false,
    semanticKeywords: ['上下文', '历史会话', '上一轮问题'],
    description: '读取受当前会话有效期约束的最近对话上下文。',
  },
  {
    commandKey: 'qa.create',
    name: '创建标准问答',
    action: 'create',
    executionMode: 'api',
    handlerKey: 'qa.create',
    executionTarget: 'KnowledgeStandardQasController.create',
    apiMethod: 'POST',
    apiPath: '/api/knowledge-standard-qas',
    requestSchema: toJson({
      type: 'object',
      required: ['question', 'answer'],
      properties: { question: { type: 'string' }, answer: { type: 'string' } },
    }),
    contextBindings: toJson({ status: 'draft', operatorId: '$operator.id' }),
    chatCallable: false,
    requireApproval: true,
    semanticKeywords: ['收录问答', '新增标准答案'],
    description: '后台人工收录问答；默认草稿，审核后才允许聊天命中。',
  },
  {
    commandKey: 'qa.update',
    name: '更新标准问答',
    action: 'update',
    executionMode: 'api',
    handlerKey: 'qa.update',
    executionTarget: 'KnowledgeStandardQasController.update',
    apiMethod: 'PATCH',
    apiPath: '/api/knowledge-standard-qas/{id}',
    requestSchema: toJson({
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'integer' } },
    }),
    contextBindings: toJson({ operatorId: '$operator.id' }),
    chatCallable: false,
    requireApproval: true,
    semanticKeywords: ['修改标准问答', '发布标准答案'],
    description: '后台更新标准问答，发布与答案变更会留下审核版本。',
  },
  {
    commandKey: 'qa.delete',
    name: '删除标准问答',
    action: 'delete',
    executionMode: 'api',
    handlerKey: 'qa.delete',
    executionTarget: 'KnowledgeStandardQasController.remove',
    apiMethod: 'DELETE',
    apiPath: '/api/knowledge-standard-qas/{id}',
    requestSchema: toJson({
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'integer' } },
    }),
    contextBindings: toJson({ operatorId: '$operator.id' }),
    chatCallable: false,
    requireApproval: true,
    semanticKeywords: ['删除标准问答'],
    description: '仅管理端有权限执行；聊天模型不可调用。',
  },
];

export const AI_COMMAND_CATALOG_MAP = new Map(
  AI_COMMAND_CATALOG.map((item) => [item.commandKey, item]),
);
