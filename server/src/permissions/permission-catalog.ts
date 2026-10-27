/** 内置动作目录；业务扩展动作须同时登记模块、接口和按钮。 */
export const PERMISSION_ACTIONS = [
  {
    code: 'read',
    name: '查看',
    type: 'button',
  },
  {
    code: 'create',
    name: '新增',
    type: 'button',
  },
  {
    code: 'update',
    name: '编辑',
    type: 'button',
  },
  {
    code: 'delete',
    name: '删除',
    type: 'button',
  },
  {
    code: 'batchDelete',
    name: '批量删除',
    type: 'button',
  },
  {
    code: 'aiGenerate',
    name: 'AI 生成',
    type: 'button',
  },
  {
    code: 'aiRefine',
    name: 'AI 提炼',
    type: 'button',
  },
] as const;

export interface PermissionModuleDefinition {
  code: string;
  name: string;
  actions: string[];
}

/** 按真实接口与业务入口维护，不对每个模块笛卡尔组合全部动作。 */
export const PERMISSION_MODULES: PermissionModuleDefinition[] = [
  {
    code: 'AgentApp',
    name: 'Agent 应用',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'AgentWorkspace',
    name: 'Agent 工作台',
    actions: ['read'],
  },
  {
    code: 'AiCommandDefinition',
    name: '指令定义',
    actions: ['read', 'update'],
  },
  {
    code: 'AiMaterial',
    name: 'AI 素材',
    actions: [
      'read',
      'create',
      'update',
      'delete',
      'batchDelete',
      'aiGenerate',
    ],
  },
  {
    code: 'AiWorkflow',
    name: 'AI 工作流',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'ComfyConnection',
    name: 'ComfyUI 服务',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'ComfyMaterial',
    name: 'ComfyUI 素材库',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'ComfyTask',
    name: 'ComfyUI 创作任务',
    actions: [
      'read',
      'create',
      'update',
      'delete',
      'batchDelete',
      'aiGenerate',
    ],
  },
  {
    code: 'ComfyWorkflow',
    name: 'ComfyUI 工作流',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'ContentArticle',
    name: '文章创作',
    actions: [
      'read',
      'create',
      'update',
      'delete',
      'batchDelete',
      'aiGenerate',
    ],
  },
  {
    code: 'ContentTemplate',
    name: '写作模板',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'CustomerService',
    name: '客服接待',
    actions: ['read', 'create', 'update'],
  },
  {
    code: 'DashboardConfig',
    name: '首页配置',
    actions: ['read', 'update'],
  },
  {
    code: 'DataImport',
    name: '数据导入',
    actions: ['read', 'create', 'update'],
  },
  {
    code: 'Demo',
    name: '示例管理',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'HotTopic',
    name: '热点选题',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'HotTopicSource',
    name: '热点来源',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'KnowledgeAiProvider',
    name: '大模型账号',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'KnowledgeBase',
    name: '知识库（含分类和分块配置）',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'KnowledgeColloquialTerm',
    name: '口语词库',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'KnowledgeRoutingRule',
    name: '知识路由规则',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'KnowledgeStandardQa',
    name: '标准问答',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'LogRecord',
    name: '操作日志',
    actions: ['read', 'update'],
  },
  {
    code: 'MediaStorage',
    name: '媒体存储',
    actions: ['read', 'update'],
  },
  {
    code: 'Menu',
    name: '菜单及通用系统配置',
    actions: ['read', 'create', 'update', 'delete'],
  },
  {
    code: 'MineruConfig',
    name: 'MinerU 解析',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'ModelEndpoint',
    name: '模型厂商接口',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'Permission',
    name: '权限定义',
    actions: ['read', 'create', 'update', 'delete'],
  },
  {
    code: 'Product',
    name: '产品',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'ProductSku',
    name: 'SKU',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'Role',
    name: '角色',
    actions: ['read', 'create', 'update', 'delete'],
  },
  {
    code: 'StorageConfig',
    name: 'OSS / CDN',
    actions: ['read', 'update'],
  },
  {
    code: 'User',
    name: '账号',
    actions: ['read', 'create', 'update', 'delete'],
  },
  {
    code: 'VectorConfig',
    name: '向量化服务',
    actions: ['read', 'create', 'update', 'delete', 'batchDelete'],
  },
  {
    code: 'VisualPromptTemplate',
    name: '提示词总结',
    actions: [
      'read',
      'create',
      'update',
      'delete',
      'batchDelete',
      'aiGenerate',
      'aiRefine',
    ],
  },
  {
    code: 'WechatConfig',
    name: '微信 / 小程序',
    actions: ['read', 'update'],
  },
];

export function getRegisteredPermissionCodes(): string[] {
  return PERMISSION_MODULES.flatMap((module) =>
    module.actions.map((action) => module.code + '.' + action),
  );
}
