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

/** 所有聊天应用默认保留的基础问答链路能力。 */
export const AI_CORE_CHAT_COMMAND_KEYS = [
  'qa.search',
  'colloquial.rewrite',
  'knowledge.retrieve',
] as const;

const toJson = (value: unknown) => JSON.stringify(value, null, 2);

/**
 * 该目录是唯一可执行白名单。数据库记录只负责管理语义与启停，
 * 不允许将指令映射到目录以外的 URL 或服务方法。
 */
export const AI_COMMAND_CATALOG: AiCommandCatalogItem[] = [
  {
    commandKey: 'colloquial.rewrite',
    name: '口语化表达改写',
    action: 'read',
    executionMode: 'service',
    handlerKey: 'colloquial.rewrite',
    executionTarget: 'KnowledgeColloquialTermsService.rewriteQuestion',
    apiMethod: 'POST',
    apiPath: 'service://knowledge-colloquial-terms/rewrite',
    requestSchema: toJson({
      type: 'object',
      required: ['question'],
      properties: {
        question: { type: 'string' },
      },
    }),
    contextBindings: toJson({
      source: 'manual-colloquial-terms',
    }),
    chatCallable: true,
    requireApproval: false,
    semanticKeywords: ['口语化', '简称', '标准表达', '术语理解'],
    description: '使用人工维护的口语化表达词库改写问题，并附加业务定性约束。',
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
      required: ['question'],
      properties: {
        question: { type: 'string' },
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
    description: '仅在当前应用范围内精确匹配已发布且有效的标准问题或相似问法。',
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
    commandKey: 'product.sku.lookup',
    name: '产品与 SKU 事实查询',
    action: 'read',
    executionMode: 'service',
    handlerKey: 'product.sku.lookup',
    executionTarget: 'ProductCatalogService.findSkuContextForChat',
    apiMethod: 'POST',
    apiPath: 'service://product-catalog/sku-context',
    requestSchema: toJson({
      type: 'object',
      required: ['question'],
      properties: {
        question: {
          type: 'string',
          description: '已完成口语校准的用户问题，可包含产品名、别名或 SKU 编码。',
        },
      },
    }),
    contextBindings: toJson({
      source: 'product-catalog',
      result: 'product-and-sku-facts',
    }),
    chatCallable: true,
    requireApproval: false,
    semanticKeywords: ['产品', 'SKU', '规格', '参数', '重量', '尺寸', '型号'],
    description:
      '按问题识别产品或 SKU，并返回受控的结构化事实；无法唯一定位 SKU 时仅返回候选项，不得猜测参数。',
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
