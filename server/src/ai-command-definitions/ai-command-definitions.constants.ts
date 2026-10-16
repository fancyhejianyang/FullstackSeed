import { DEMO_CATEGORIES, DEMO_STATUSES } from '../demo/demo.constants';
import { KNOWLEDGE_COLLOQUIAL_SEMANTIC_TYPES } from '../knowledge-colloquial-terms/entities/knowledge-colloquial-term.entity';

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

interface BusinessCrudCommandSpec {
  moduleKey: string;
  moduleName: string;
  controllerName: string;
  apiBasePath: string;
  permissionPrefix: string;
  querySchema: Record<string, unknown>;
  createSchema: Record<string, unknown>;
  semanticKeywords: string[];
  methods: {
    list: string;
    detail: string;
    create: string;
    update: string;
    delete: string;
    batchDelete: string;
  };
}

const entityIdSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
};

const batchDeleteSchema = {
  type: 'object',
  required: ['ids'],
  properties: {
    ids: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { type: 'integer', minimum: 1 },
    },
  },
};

function withEntityId(schema: Record<string, unknown>) {
  const properties =
    schema.properties && typeof schema.properties === 'object'
      ? (schema.properties as Record<string, unknown>)
      : {};
  return {
    ...schema,
    required: ['id'],
    properties: {
      id: { type: 'integer', minimum: 1 },
      ...properties,
    },
  };
}

function businessCommand(
  spec: BusinessCrudCommandSpec,
  options: {
    suffix: 'list' | 'detail' | 'create' | 'update' | 'delete' | 'batchDelete';
    name: string;
    action: AiCommandAction;
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    path: string;
    requestSchema: Record<string, unknown>;
    permissionAction: 'read' | 'create' | 'update' | 'delete' | 'batchDelete';
    chatCallable: boolean;
    semanticKeywords: string[];
    description: string;
  },
): AiCommandCatalogItem {
  const requireApproval = options.action !== 'read';
  return {
    commandKey: `${spec.moduleKey}.${options.suffix}`,
    name: options.name,
    action: options.action,
    executionMode: 'api',
    handlerKey: `${spec.moduleKey}.${options.suffix}`,
    executionTarget: `${spec.controllerName}.${spec.methods[options.suffix]}`,
    apiMethod: options.method,
    apiPath: options.path,
    requestSchema: toJson(options.requestSchema),
    contextBindings: toJson({
      requiredPermission: `${spec.permissionPrefix}.${options.permissionAction}`,
      operatorId: '$operator.id',
      source: 'registered-business-controller',
    }),
    chatCallable: options.chatCallable,
    requireApproval,
    semanticKeywords: Array.from(
      new Set([...spec.semanticKeywords, ...options.semanticKeywords]),
    ),
    description: options.description,
  };
}

function createBusinessCrudCatalog(
  spec: BusinessCrudCommandSpec,
): AiCommandCatalogItem[] {
  return [
    businessCommand(spec, {
      suffix: 'list',
      name: `查询${spec.moduleName}列表`,
      action: 'read',
      method: 'GET',
      path: spec.apiBasePath,
      requestSchema: spec.querySchema,
      permissionAction: 'read',
      chatCallable: true,
      semanticKeywords: ['查询', '搜索', '列表', '有哪些'],
      description: `按受控查询条件分页读取${spec.moduleName}，执行时继续校验当前员工的读取权限。`,
    }),
    businessCommand(spec, {
      suffix: 'detail',
      name: `查询${spec.moduleName}详情`,
      action: 'read',
      method: 'GET',
      path: `${spec.apiBasePath}/{id}`,
      requestSchema: entityIdSchema,
      permissionAction: 'read',
      chatCallable: true,
      semanticKeywords: ['详情', '记录', '查看'],
      description: `按业务记录 ID 读取${spec.moduleName}详情，模型不能猜测或绕过 ID 解析。`,
    }),
    businessCommand(spec, {
      suffix: 'create',
      name: `创建${spec.moduleName}`,
      action: 'create',
      method: 'POST',
      path: spec.apiBasePath,
      requestSchema: spec.createSchema,
      permissionAction: 'create',
      chatCallable: true,
      semanticKeywords: ['创建', '新增', '添加', '录入'],
      description: `根据受控字段生成${spec.moduleName}创建草稿；聊天调用必须人工确认后才可提交。`,
    }),
    businessCommand(spec, {
      suffix: 'update',
      name: `更新${spec.moduleName}`,
      action: 'update',
      method: 'PATCH',
      path: `${spec.apiBasePath}/{id}`,
      requestSchema: withEntityId(spec.createSchema),
      permissionAction: 'update',
      chatCallable: false,
      semanticKeywords: ['更新', '修改', '编辑'],
      description: `更新指定${spec.moduleName}；当前仅登记执行契约，不开放给聊天模型。`,
    }),
    businessCommand(spec, {
      suffix: 'delete',
      name: `删除${spec.moduleName}`,
      action: 'delete',
      method: 'DELETE',
      path: `${spec.apiBasePath}/{id}`,
      requestSchema: entityIdSchema,
      permissionAction: 'delete',
      chatCallable: false,
      semanticKeywords: ['删除', '移除'],
      description: `删除指定${spec.moduleName}；属于破坏性动作，不开放给聊天模型。`,
    }),
    businessCommand(spec, {
      suffix: 'batchDelete',
      name: `批量删除${spec.moduleName}`,
      action: 'delete',
      method: 'POST',
      path: `${spec.apiBasePath}/batch-delete`,
      requestSchema: batchDeleteSchema,
      permissionAction: 'batchDelete',
      chatCallable: false,
      semanticKeywords: ['批量删除', '批量移除'],
      description: `批量删除${spec.moduleName}；属于高风险动作，不开放给聊天模型。`,
    }),
  ];
}

/**
 * 首批允许进入指令集的非 AI 业务模块。
 *
 * 这里只登记已有 Controller/DTO 的真实契约。账号、角色、权限、菜单、日志、
 * 存储和模型配置等平台基础设施刻意不注册，避免 Agent 获得越权或配置篡改入口。
 */
export const AI_BUSINESS_COMMAND_CATALOG: AiCommandCatalogItem[] = [
  ...createBusinessCrudCatalog({
    moduleKey: 'standardQa',
    moduleName: '标准问答',
    controllerName: 'KnowledgeStandardQasController',
    apiBasePath: '/api/knowledge-standard-qas',
    permissionPrefix: 'KnowledgeStandardQa',
    semanticKeywords: ['标准问答', '标准问题', '标准答案'],
    querySchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string' },
        status: {
          type: 'string',
          enum: ['draft', 'pending', 'published', 'disabled'],
        },
      },
    },
    createSchema: {
      type: 'object',
      required: ['question', 'answer'],
      properties: {
        question: { type: 'string', title: '标准问题', maxLength: 2000 },
        answer: { type: 'string', title: '标准答案' },
        aliases: {
          type: 'array',
          title: '相似问法',
          items: { type: 'string' },
        },
      },
    },
    methods: {
      list: 'findAll',
      detail: 'findOne',
      create: 'create',
      update: 'update',
      delete: 'remove',
      batchDelete: 'batchRemove',
    },
  }),
  ...createBusinessCrudCatalog({
    moduleKey: 'colloquialTerm',
    moduleName: '口语词条',
    controllerName: 'KnowledgeColloquialTermsController',
    apiBasePath: '/api/knowledge-colloquial-terms',
    permissionPrefix: 'KnowledgeColloquialTerm',
    semanticKeywords: ['口语', '词库', '词条', '术语'],
    querySchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string' },
        isEnabled: { type: 'boolean' },
      },
    },
    createSchema: {
      type: 'object',
      required: ['term', 'replacement', 'semanticDefinition'],
      properties: {
        term: { type: 'string', title: '口语表达', maxLength: 160 },
        replacement: { type: 'string', title: '标准替换文本', maxLength: 500 },
        semanticDefinition: {
          type: 'string',
          title: '业务定性',
          maxLength: 2000,
        },
        semanticType: {
          type: 'string',
          title: '语义类型',
          enum: [...KNOWLEDGE_COLLOQUIAL_SEMANTIC_TYPES],
          default: 'custom',
        },
        excludePhrases: {
          type: 'array',
          title: '排除短语',
          items: { type: 'string' },
        },
        isEnabled: { type: 'boolean', title: '是否启用', default: false },
      },
    },
    methods: {
      list: 'findAll',
      detail: 'findOne',
      create: 'create',
      update: 'update',
      delete: 'remove',
      batchDelete: 'batchRemove',
    },
  }),
  ...createBusinessCrudCatalog({
    moduleKey: 'knowledgeBase',
    moduleName: '知识库文本',
    controllerName: 'KnowledgeBasesController',
    apiBasePath: '/api/knowledge-bases',
    permissionPrefix: 'KnowledgeBase',
    semanticKeywords: ['知识库', '知识内容', '知识文档'],
    querySchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string' },
        categoryId: { type: 'integer', minimum: 1 },
      },
    },
    createSchema: {
      type: 'object',
      required: ['categoryId', 'name', 'contentText'],
      properties: {
        categoryId: { type: 'integer', title: '知识库分类 ID', minimum: 1 },
        name: { type: 'string', title: '知识库名称' },
        description: { type: 'string', title: '描述' },
        contentText: { type: 'string', title: '文本正文' },
        isEnabled: { type: 'boolean', title: '是否启用', default: false },
      },
    },
    methods: {
      list: 'findBases',
      detail: 'findBase',
      create: 'createBase',
      update: 'updateBase',
      delete: 'removeBase',
      batchDelete: 'batchRemoveBases',
    },
  }),
  ...createBusinessCrudCatalog({
    moduleKey: 'demo',
    moduleName: '示例数据',
    controllerName: 'DemoController',
    apiBasePath: '/api/demo',
    permissionPrefix: 'Demo',
    semanticKeywords: ['示例', '示例模块', '测试数据', '演示数据'],
    querySchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        pageSize: { type: 'integer', minimum: 1, default: 10 },
        keyword: { type: 'string' },
        status: { type: 'string', enum: [...DEMO_STATUSES] },
      },
    },
    createSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', minLength: 1 },
        content: { type: 'string' },
        category: { type: 'string', enum: [...DEMO_CATEGORIES] },
        status: { type: 'string', enum: [...DEMO_STATUSES] },
        publishedAt: { type: 'string', format: 'date-time' },
        activeRange: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 2,
        },
        contactPhone: { type: 'string' },
        email: { type: 'string', format: 'email' },
        quantity: { type: 'integer', minimum: 0 },
        unitPrice: { type: 'number', minimum: 0 },
        budgetAmount: { type: 'number', minimum: 0 },
        isFeatured: { type: 'boolean' },
        allowComment: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
        channels: { type: 'array', items: { type: 'string' } },
        imageUrl: { type: 'string' },
        attachmentName: { type: 'string' },
        attachmentUrl: { type: 'string' },
      },
    },
    methods: {
      list: 'findAll',
      detail: 'findOne',
      create: 'create',
      update: 'update',
      delete: 'remove',
      batchDelete: 'batchRemove',
    },
  }),
  ...createBusinessCrudCatalog({
    moduleKey: 'product',
    moduleName: '产品',
    controllerName: 'ProductCatalogController',
    apiBasePath: '/api/products',
    permissionPrefix: 'Product',
    semanticKeywords: ['产品', '产品资料', '产品库'],
    querySchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        pageSize: { type: 'integer', minimum: 1, default: 10 },
        keyword: { type: 'string' },
        isEnabled: { type: 'boolean' },
      },
    },
    createSchema: {
      type: 'object',
      required: ['productCode', 'name'],
      properties: {
        productCode: { type: 'string', minLength: 1, maxLength: 80 },
        name: { type: 'string', minLength: 1, maxLength: 160 },
        aliases: {
          type: 'array',
          items: { type: 'string', maxLength: 160 },
        },
        category: { type: 'string', maxLength: 80 },
        description: { type: 'string' },
        isEnabled: { type: 'boolean' },
      },
    },
    methods: {
      list: 'findProducts',
      detail: 'findProduct',
      create: 'createProduct',
      update: 'updateProduct',
      delete: 'removeProduct',
      batchDelete: 'batchRemoveProducts',
    },
  }),
  ...createBusinessCrudCatalog({
    moduleKey: 'productSku',
    moduleName: 'SKU',
    controllerName: 'ProductCatalogController',
    apiBasePath: '/api/product-skus',
    permissionPrefix: 'ProductSku',
    semanticKeywords: ['SKU', '产品规格', '规格型号'],
    querySchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        pageSize: { type: 'integer', minimum: 1, default: 10 },
        keyword: { type: 'string' },
        productId: { type: 'integer', minimum: 1 },
        isEnabled: { type: 'boolean' },
      },
    },
    createSchema: {
      type: 'object',
      required: ['productId', 'specifications'],
      properties: {
        productId: { type: 'integer', minimum: 1 },
        skuCode: { type: 'string', minLength: 1, maxLength: 100 },
        name: { type: 'string', maxLength: 160 },
        specifications: {
          type: 'object',
          additionalProperties: true,
          minProperties: 1,
        },
        isEnabled: { type: 'boolean' },
      },
    },
    methods: {
      list: 'findSkus',
      detail: 'findSku',
      create: 'createSku',
      update: 'updateSku',
      delete: 'removeSku',
      batchDelete: 'batchRemoveSkus',
    },
  }),
];

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
          description:
            '已完成口语校准的用户问题，可包含产品名、别名或 SKU 编码。',
        },
        keywords: {
          type: 'array',
          items: { type: 'string', minLength: 2, maxLength: 40 },
          maxItems: 6,
          description:
            '从本轮原始或校准问题提炼的核心产品词，按名称/别名进行部分匹配；多产品返回候选，不猜定单一产品。',
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
  ...AI_BUSINESS_COMMAND_CATALOG,
];

export const AI_COMMAND_CATALOG_MAP = new Map(
  AI_COMMAND_CATALOG.map((item) => [item.commandKey, item]),
);
