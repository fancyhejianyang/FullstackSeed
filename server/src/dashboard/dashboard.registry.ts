import { BadRequestException } from '@nestjs/common';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type {
  WidgetConfig,
  WidgetDefinition,
  WidgetParameter,
} from './dashboard.types';

const days: WidgetParameter = {
  key: 'days',
  label: '统计周期',
  type: 'select',
  defaultValue: 7,
  options: [
    { label: '近 7 天', value: 7 },
    { label: '近 30 天', value: 30 },
  ],
};
const limit: WidgetParameter = {
  key: 'limit',
  label: '显示数量',
  type: 'integer',
  defaultValue: 8,
  min: 5,
  max: 10,
};
const businessPermissions = [
  'AgentApp.read',
  'CustomerService.read',
  'ApprovalRequest.read',
  'Product.read',
  'ProductSku.read',
  'KnowledgeBase.read',
];
const corePermissions = [
  ...businessPermissions,
  'ContentArticle.read',
  'AiMaterial.read',
  'ComfyTask.read',
];
export const DASHBOARD_LINKS = [
  {
    key: 'agent',
    label: 'Agent 工作台',
    path: '/agent-management/workspace',
    permission: 'AgentWorkspace.read',
  },
  {
    key: 'apps',
    label: 'Agent 应用',
    path: '/agent-management/apps',
    permission: 'AgentApp.read',
  },
  {
    key: 'customer',
    label: '客服工作台',
    path: '/customer-service',
    permission: 'CustomerService.read',
  },
  {
    key: 'knowledge',
    label: '知识库',
    path: '/knowledge-bases/list',
    permission: 'KnowledgeBase.read',
  },
  {
    key: 'product',
    label: '产品库',
    path: '/business-data/products',
    permission: 'Product.read',
  },
  {
    key: 'sku',
    label: 'SKU 库',
    path: '/business-data/product-skus',
    permission: 'ProductSku.read',
  },
  {
    key: 'approvals',
    label: '审批管理',
    path: '/collaboration-center/approvals',
    permission: 'ApprovalRequest.read',
  },
  {
    key: 'articles',
    label: '文章创作',
    path: '/content-articles',
    permission: 'ContentArticle.read',
  },
  {
    key: 'contentGeneration',
    label: '生成记录',
    path: '/content-generation',
    permission: 'ContentArticle.read',
  },
  {
    key: 'materials',
    label: '素材管理',
    path: '/ai-materials',
    permission: 'AiMaterial.read',
  },
  {
    key: 'comfyCreate',
    label: 'ComfyUI 创作',
    path: '/comfyui/create',
    permission: 'ComfyTask.read',
  },
  {
    key: 'comfyMaterials',
    label: 'ComfyUI 素材',
    path: '/comfyui/materials',
    permission: 'ComfyMaterial.read',
  },
  {
    key: 'comfyTasks',
    label: 'ComfyUI 生成记录',
    path: '/comfyui/tasks',
    permission: 'ComfyTask.read',
  },
];
const metricOptions = [
  { label: '今日执行', value: 'agentTotal' },
  { label: '今日成功率', value: 'agentRate' },
  { label: '等待人工', value: 'waitingHuman' },
  { label: '待审批', value: 'pendingApprovals' },
  { label: '产品总数', value: 'productTotal' },
  { label: 'SKU 总数', value: 'skuTotal' },
  { label: '内容创作数', value: 'contentTotal' },
  { label: 'AI 素材数', value: 'materialTotal' },
  { label: '生成记录数', value: 'generationTotal' },
];
export const DASHBOARD_WIDGETS: WidgetDefinition[] = [
  {
    key: 'core.metrics',
    name: '核心数据',
    description: '执行、客服、审批、商品与内容资产概览',
    category: 'metric',
    permissionCodes: corePermissions,
    allowedSpans: [12],
    defaultSpan: 12,
    schemaVersion: 2,
    parameters: [
      {
        key: 'metrics',
        label: '显示指标',
        type: 'multiSelect',
        defaultValue: metricOptions.map((x) => x.value),
        options: metricOptions,
      },
    ],
  },
  {
    key: 'agent.executionTrend',
    name: 'Agent 执行趋势',
    description: '按执行创建日观察数量与当前终态成功率',
    category: 'chart',
    permissionCodes: ['AgentApp.read'],
    allowedSpans: [6, 8, 12],
    defaultSpan: 8,
    schemaVersion: 1,
    parameters: [
      days,
      {
        key: 'showToken',
        label: '显示 Token 用量',
        type: 'boolean',
        defaultValue: true,
      },
      {
        key: 'showAverageDuration',
        label: '显示模型耗时',
        type: 'boolean',
        defaultValue: true,
      },
    ],
  },
  {
    key: 'business.health',
    name: '业务健康概览',
    description: '应用启用、知识资产与接待状态',
    category: 'metric',
    permissionCodes: businessPermissions,
    allowedSpans: [4, 6, 12],
    defaultSpan: 4,
    schemaVersion: 1,
    parameters: [],
  },
  {
    key: 'catalog.distribution',
    name: '产品与 SKU 分布',
    description: 'SKU 记录数量、品类分布与产品排行',
    category: 'chart',
    permissionCodes: ['Product.read', 'ProductSku.read'],
    allowedSpans: [6, 8, 12],
    defaultSpan: 6,
    schemaVersion: 1,
    parameters: [
      {
        key: 'groupBy',
        label: '统计维度',
        type: 'select',
        defaultValue: 'category',
        options: [
          { label: '按品类', value: 'category' },
          { label: 'SKU Top 产品', value: 'product' },
        ],
      },
      limit,
      {
        key: 'includeDisabled',
        label: '包含停用数据',
        type: 'boolean',
        defaultValue: true,
      },
    ],
  },
  {
    key: 'customer.taskTrend',
    name: '客服 AI 任务趋势',
    description: '按创建日统计任务当前状态',
    category: 'chart',
    permissionCodes: ['CustomerService.read'],
    allowedSpans: [6, 8, 12],
    defaultSpan: 6,
    schemaVersion: 1,
    parameters: [days],
  },
  {
    key: 'content.generationTrend',
    name: '内容与媒体生成趋势',
    description: '按来源或媒体类型观察文章、云端 AI 与 ComfyUI 生成趋势',
    category: 'chart',
    permissionCodes: [
      'ContentArticle.read',
      'AiMaterial.read',
      'ComfyTask.read',
    ],
    allowedSpans: [6, 8, 12],
    defaultSpan: 6,
    schemaVersion: 2,
    parameters: [
      days,
      {
        key: 'viewMode',
        label: '展示维度',
        type: 'select',
        defaultValue: 'source',
        options: [
          { label: '按生成来源', value: 'source' },
          { label: '按媒体类型', value: 'mediaType' },
        ],
      },
      {
        key: 'source',
        label: '生成来源',
        type: 'select',
        defaultValue: 'all',
        options: [
          { label: '全部来源', value: 'all' },
          { label: '文章创作', value: 'content' },
          { label: '云端 AI 素材', value: 'aiMaterial' },
          { label: 'ComfyUI', value: 'comfyui' },
        ],
      },
      {
        key: 'mediaType',
        label: '内容类型',
        type: 'select',
        defaultValue: 'all',
        options: [
          { label: '全部类型', value: 'all' },
          { label: '文章', value: 'article' },
          { label: '图片', value: 'image' },
          { label: '视频', value: 'video' },
        ],
      },
    ],
  },
  {
    key: 'generation.health',
    name: '生成任务健康度',
    description: '汇总文章、云端 AI 与 ComfyUI 任务状态、失败和耗时',
    category: 'chart',
    permissionCodes: [
      'ContentArticle.read',
      'AiMaterial.read',
      'ComfyTask.read',
    ],
    allowedSpans: [6, 8, 12],
    defaultSpan: 6,
    defaultEnabled: false,
    schemaVersion: 1,
    parameters: [
      days,
      {
        key: 'source',
        label: '生成来源',
        type: 'select',
        defaultValue: 'all',
        options: [
          { label: '全部来源', value: 'all' },
          { label: '文章创作', value: 'content' },
          { label: '云端 AI 素材', value: 'aiMaterial' },
          { label: 'ComfyUI', value: 'comfyui' },
        ],
      },
      {
        key: 'mediaType',
        label: '内容类型',
        type: 'select',
        defaultValue: 'all',
        options: [
          { label: '全部类型', value: 'all' },
          { label: '文章', value: 'article' },
          { label: '图片', value: 'image' },
          { label: '视频', value: 'video' },
        ],
      },
    ],
  },
  {
    key: 'creation.recent',
    name: '最近创作成果',
    description: '展示当前用户最近保存的文章、AI 素材和 ComfyUI 输出',
    category: 'list',
    permissionCodes: [
      'ContentArticle.read',
      'AiMaterial.read',
      'ComfyMaterial.read',
    ],
    allowedSpans: [6, 8, 12],
    defaultSpan: 6,
    defaultEnabled: false,
    schemaVersion: 1,
    parameters: [
      {
        key: 'source',
        label: '成果来源',
        type: 'select',
        defaultValue: 'all',
        options: [
          { label: '全部来源', value: 'all' },
          { label: '文章创作', value: 'content' },
          { label: '云端 AI 素材', value: 'aiMaterial' },
          { label: 'ComfyUI', value: 'comfyui' },
        ],
      },
      {
        key: 'mediaType',
        label: '成果类型',
        type: 'select',
        defaultValue: 'all',
        options: [
          { label: '全部类型', value: 'all' },
          { label: '文章', value: 'article' },
          { label: '图片', value: 'image' },
          { label: '视频', value: 'video' },
        ],
      },
      limit,
    ],
  },
  {
    key: 'knowledge.health',
    name: '知识库健康度',
    description: '知识库记录的处理状态与可用性',
    category: 'chart',
    permissionCodes: ['KnowledgeBase.read'],
    allowedSpans: [4, 6, 12],
    defaultSpan: 4,
    schemaVersion: 1,
    parameters: [],
  },
  {
    key: 'operations.todo',
    name: '待办与异常',
    description: '待接待、审批与近期处理失败记录',
    category: 'list',
    permissionCodes: [
      'AgentApp.read',
      'CustomerService.read',
      'ApprovalRequest.read',
      'KnowledgeBase.read',
    ],
    allowedSpans: [6, 8, 12],
    defaultSpan: 8,
    schemaVersion: 1,
    parameters: [limit],
  },
  {
    key: 'activity.recent',
    name: '最近业务动态',
    description: '有权限业务模块的近期操作',
    category: 'list',
    permissionCodes: ['LogRecord.read'],
    allowedSpans: [6, 8, 12],
    defaultSpan: 8,
    schemaVersion: 1,
    parameters: [limit],
  },
  {
    key: 'quick.actions',
    name: '快捷入口',
    description: '进入常用业务与内容创作模块',
    category: 'navigation',
    permissionCodes: DASHBOARD_LINKS.map((x) => x.permission),
    allowedSpans: [4, 6, 12],
    defaultSpan: 4,
    schemaVersion: 2,
    parameters: [
      {
        key: 'links',
        label: '显示入口',
        type: 'multiSelect',
        defaultValue: DASHBOARD_LINKS.map((x) => x.key),
        options: DASHBOARD_LINKS.map((x) => ({ label: x.label, value: x.key })),
      },
    ],
  },
];
export function allowed(user: AuthUser, code: string) {
  return user.isAdmin || user.permissions.includes(code);
}
export function canViewWidget(user: AuthUser, definition: WidgetDefinition) {
  // 跨产品/SKU 的统计需要同时拥有两类权限；混合指标按指标再次裁剪。
  return definition.key === 'catalog.distribution'
    ? definition.permissionCodes.every((code) => allowed(user, code))
    : definition.permissionCodes.some((code) => allowed(user, code));
}
export function defaultWidgets(): WidgetConfig[] {
  return DASHBOARD_WIDGETS.map((d, i) => ({
    instanceId: d.key,
    widgetKey: d.key,
    schemaVersion: d.schemaVersion,
    enabled: d.defaultEnabled !== false,
    title: d.name,
    layout: { order: i * 10, span: d.defaultSpan },
    params: Object.fromEntries(
      d.parameters.map((p) => [p.key, structuredClone(p.defaultValue)]),
    ),
  }));
}
export function validateWidgets(input: unknown): WidgetConfig[] {
  const fail = (message: string): never => {
    throw new BadRequestException(message);
  };
  if (!Array.isArray(input) || !input.length || input.length > 12)
    return fail('请配置 1～12 个板块');
  const seen = new Set<string>();
  const ids = new Set<string>();
  const result = input.map((raw: unknown): WidgetConfig => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      return fail('板块格式错误');
    const value = raw as Record<string, unknown>;
    if (
      Object.keys(value).some(
        (k) =>
          ![
            'instanceId',
            'widgetKey',
            'schemaVersion',
            'enabled',
            'title',
            'layout',
            'params',
          ].includes(k),
      )
    )
      return fail('板块包含未支持的字段');
    const d = DASHBOARD_WIDGETS.find((x) => x.key === value.widgetKey);
    if (!d || seen.has(d.key)) return fail('板块未注册或重复');
    seen.add(d.key);
    if (
      typeof value.instanceId !== 'string' ||
      !/^[a-zA-Z0-9._-]{1,64}$/.test(value.instanceId) ||
      ids.has(value.instanceId)
    )
      return fail('板块标识无效或重复');
    ids.add(value.instanceId);
    if (value.schemaVersion !== d.schemaVersion)
      return fail('板块版本已变化，请刷新配置');
    if (
      typeof value.enabled !== 'boolean' ||
      typeof value.title !== 'string' ||
      !value.title.trim() ||
      value.title.length > 40
    )
      return fail('板块标题或启用状态无效');
    const layout = value.layout as WidgetConfig['layout'] | undefined;
    if (
      !layout ||
      Object.keys(layout).some((k) => !['order', 'span'].includes(k)) ||
      !Number.isInteger(layout.order) ||
      layout.order < 0 ||
      layout.order > 1000 ||
      !d.allowedSpans.includes(layout.span)
    )
      return fail('板块布局无效');
    if (
      !value.params ||
      typeof value.params !== 'object' ||
      Array.isArray(value.params)
    )
      return fail('板块参数格式错误');
    const params = value.params as WidgetConfig['params'];
    if (Object.keys(params).some((k) => !d.parameters.some((p) => p.key === k)))
      return fail('板块包含未支持的参数');
    for (const p of d.parameters) {
      const v = params[p.key];
      if (p.type === 'boolean' && typeof v !== 'boolean')
        return fail(p.label + '必须为开关');
      if (
        p.type === 'integer' &&
        (typeof v !== 'number' ||
          !Number.isInteger(v) ||
          v < p.min! ||
          v > p.max!)
      )
        return fail(p.label + '超出范围');
      if (p.type === 'select' && !p.options?.some((x) => x.value === v))
        return fail(p.label + '选项无效');
      if (
        p.type === 'multiSelect' &&
        (!Array.isArray(v) ||
          !v.length ||
          new Set(v).size !== v.length ||
          v.some((x) => !p.options?.some((o) => o.value === x)))
      )
        return fail(p.label + '选项无效');
    }
    return {
      instanceId: value.instanceId,
      widgetKey: d.key,
      schemaVersion: d.schemaVersion,
      enabled: value.enabled,
      title: value.title.trim(),
      layout: { order: layout.order, span: layout.span },
      params: structuredClone(params),
    };
  });
  if (!result.some((x) => x.enabled)) return fail('请至少启用一个板块');
  return result.sort((a, b) => a.layout.order - b.layout.order);
}
/** 运行时兼容：未知板块跳过；参数升级回退该板块；新增板块以关闭状态加入旧配置。 */
export function resolveWidgets(input: unknown): WidgetConfig[] {
  if (!Array.isArray(input)) return defaultWidgets();
  const resolved = input
    .flatMap((x: WidgetConfig) => {
      const fallback = defaultWidgets().find(
        (d) => d.widgetKey === x?.widgetKey,
      );
      if (!fallback) return [];
      try {
        return validateWidgets([{ ...x, enabled: true }]).map((v) => ({
          ...v,
          enabled: x.enabled === true,
        }));
      } catch {
        return [{ ...fallback, enabled: x.enabled === true }];
      }
    })
    .sort((a, b) => a.layout.order - b.layout.order);
  const present = new Set(resolved.map((x) => x.widgetKey));
  const maxOrder = resolved.reduce(
    (highest, widget) => Math.max(highest, widget.layout.order),
    -10,
  );
  return [
    ...resolved,
    ...defaultWidgets()
      .filter((widget) => !present.has(widget.widgetKey))
      .map((widget, index) => ({
        ...widget,
        enabled: false,
        layout: { ...widget.layout, order: maxOrder + (index + 1) * 10 },
      })),
  ].sort((a, b) => a.layout.order - b.layout.order);
}
