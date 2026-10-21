import { AI_BUSINESS_COMMAND_CATALOG } from '../ai-command-definitions/ai-command-definitions.constants';
import { MODULE_MODEL_MAP } from '../module-models/module-models.map';

/** 显式业务边界，不扫描 Controller/数据库，也不信任配置里的 URL 或 handler。 */
export const AGENT_BUSINESS_MODULES = {
  demo: { name: '示例数据', permission: 'Demo', path: '/demo', note: '' },
  product: {
    name: '产品',
    permission: 'Product',
    path: '/business-data/products',
    note: '',
  },
  productSku: {
    name: 'SKU',
    permission: 'ProductSku',
    path: '/business-data/product-skus',
    note: '',
  },
  standardQa: {
    name: '标准问答',
    permission: 'KnowledgeStandardQa',
    path: '/chat-management/standard-qas',
    note: '默认停用；核对答案后可在标准问答页面启用。',
  },
  colloquialTerm: {
    name: '口语词条',
    permission: 'KnowledgeColloquialTerm',
    path: '/chat-management/colloquial-terms',
    note: '默认停用；启用后会影响聊天术语理解，请核对业务定性。',
  },
  knowledgeBase: {
    name: '知识库文本',
    permission: 'KnowledgeBase',
    path: '/knowledge-bases/list',
    note: '仅创建文本内容，默认停用；沿用文本拆分规则，分片、索引须在知识库页面执行。',
  },
  knowledgeCategory: {
    name: '知识库分类',
    permission: 'KnowledgeBase',
    path: '/knowledge-bases/categories',
    note: '仅新增分类，不移动、删除分类；上级为空表示顶级分类，编码可选。',
  },
  contentArticle: {
    name: '文章生成任务',
    permission: 'ContentArticle',
    path: '/content-articles',
    note: '确认后会创建文章并提交后台生成任务；可到“文章创作”或“生成记录”查看进度与结果。',
  },
} as const;

export type AgentBusinessModuleKey = keyof typeof AGENT_BUSINESS_MODULES;
export const AGENT_BUSINESS_READ_FIELDS: Partial<
  Record<AgentBusinessModuleKey, Array<{ prop: string; label: string }>>
> = {
  standardQa: [
    { prop: 'isActive', label: '启用状态' },
    { prop: 'version', label: '版本' },
  ],
  knowledgeBase: [
    { prop: 'contentType', label: '内容类型' },
    { prop: 'processStage', label: '处理阶段' },
    { prop: 'indexStatus', label: '索引状态' },
  ],
};
export interface AgentFieldSchema {
  type: string;
  title?: string;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maxLength?: number;
  minLength?: number;
  minProperties?: number;
  maxItems?: number;
  items?: AgentFieldSchema;
}
export interface AgentBusinessField extends AgentFieldSchema {
  prop: string;
  label: string;
  required: boolean;
  options?: { label: string; value: number | string }[];
}
export interface AgentBusinessForm {
  name: string;
  permission: string;
  detailPath: string;
  note: string;
  fields: AgentBusinessField[];
}
const labels: Record<string, string> = {
  id: 'ID',
  productId: '所属产品',
  productCode: '产品编码',
  skuCode: 'SKU 编码',
  name: '名称',
  aliases: '别名',
  category: '分类',
  description: '描述',
  specifications: '规格参数',
  isEnabled: '是否启用',
  page: '页码',
  pageSize: '每页条数',
  keyword: '关键词',
  title: '工作标题',
  idea: '想法',
  aiConfigId: 'AI 配置',
  templateId: '写作模板',
};

export const AGENT_BUSINESS_TOOLS = AI_BUSINESS_COMMAND_CATALOG.filter(
  (item) =>
    item.chatCallable &&
    Object.hasOwn(AGENT_BUSINESS_MODULES, item.commandKey.split('.')[0]) &&
    ['list', 'detail', 'create', 'generate'].includes(
      item.commandKey.split('.')[1],
    ),
).map((item) => {
  const [moduleKey, commandOperation] = item.commandKey.split('.') as [
    AgentBusinessModuleKey,
    'list' | 'detail' | 'create' | 'generate',
  ];
  const operation =
    commandOperation === 'generate' ? 'create' : commandOperation;
  const module = AGENT_BUSINESS_MODULES[moduleKey];
  const schema = JSON.parse(item.requestSchema) as {
    properties: Record<string, AgentFieldSchema>;
    required?: string[];
  };
  if (operation === 'list') {
    schema.properties.page = { type: 'integer', minimum: 1, default: 1 };
    schema.properties.pageSize = { type: 'integer', minimum: 1, default: 10 };
  }
  return {
    commandKey: item.commandKey,
    name: item.name,
    moduleKey,
    operation,
    permission: `${module.permission}.${operation === 'create' ? 'create' : 'read'}`,
    // 外键选择也需要读取所属业务的权限。
    extraPermissions:
      item.commandKey === 'contentArticle.generate'
        ? ['ContentArticle.update']
        : operation === 'create' && moduleKey === 'productSku'
          ? ['Product.read']
          : operation === 'create' &&
              ['knowledgeBase', 'knowledgeCategory'].includes(moduleKey)
            ? ['KnowledgeBase.read']
            : [],
    detailPath: module.path,
    note: module.note,
    fields: Object.entries(schema.properties).map(
      ([prop, field]): AgentBusinessField => ({
        ...field,
        prop,
        label:
          field.title ??
          MODULE_MODEL_MAP[moduleKey]?.fields.find(
            (entry) => entry.prop === prop,
          )?.label ??
          labels[prop] ??
          prop,
        required: schema.required?.includes(prop) ?? false,
      }),
    ),
  };
});

export function getAgentBusinessTool(key: string) {
  return AGENT_BUSINESS_TOOLS.find((tool) => tool.commandKey === key);
}
