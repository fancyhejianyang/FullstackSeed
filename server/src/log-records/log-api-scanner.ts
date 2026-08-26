import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, relative, resolve, sep } from 'path';
import { MODULE_MODEL_MAP } from '../module-models/module-models.map';

export interface ScannedLogApi {
  action: string;
  label: string;
  method: string;
  path: string;
  pathPattern: RegExp;
}

export interface ScannedLogModule {
  moduleId: string;
  moduleName: string;
  modelName: string;
  tableName: string;
  routePath: string;
  sourceFile: string;
  isSystem: boolean;
  actions: ScannedLogApi[];
}

const INTERNAL_METHOD = 'INTERNAL';

const INTERNAL_LOG_MODULES: ScannedLogModule[] = [
  {
    moduleId: 'async-tasks',
    moduleName: '文档处理异步任务',
    modelName: 'TaskQueue',
    tableName: 'task_queue',
    routePath: '/internal/async-tasks',
    sourceFile: 'internal',
    isSystem: false,
    actions: [
      createInternalAction(
        'submitted',
        '任务提交',
        '/internal/async-tasks/submitted',
      ),
      createInternalAction(
        'running',
        '任务执行中',
        '/internal/async-tasks/running',
      ),
      createInternalAction(
        'success',
        '任务成功',
        '/internal/async-tasks/success',
      ),
      createInternalAction(
        'failed',
        '任务失败',
        '/internal/async-tasks/failed',
      ),
    ],
  },
  {
    moduleId: 'knowledge-processing',
    moduleName: '知识库处理',
    modelName: 'KnowledgeBase',
    tableName: 'knowledge_bases',
    routePath: '/internal/knowledge-processing',
    sourceFile: 'internal',
    isSystem: false,
    actions: [
      createInternalAction(
        'manualParse',
        '手动解析',
        '/internal/knowledge-processing/manual-parse',
      ),
      createInternalAction(
        'mineruParse',
        'MinerU 解析',
        '/internal/knowledge-processing/mineru-parse',
      ),
      createInternalAction(
        'chunk',
        '分片',
        '/internal/knowledge-processing/chunk',
      ),
      createInternalAction(
        'index',
        '索引',
        '/internal/knowledge-processing/index',
      ),
    ],
  },
  {
    moduleId: 'ai-model-calls',
    moduleName: '大模型调用',
    modelName: 'KnowledgeAiProvider',
    tableName: 'knowledge_ai_providers',
    routePath: '/internal/ai-model-calls',
    sourceFile: 'internal',
    isSystem: false,
    actions: [
      createInternalAction(
        'visionOcr',
        '视觉 OCR',
        '/internal/ai-model-calls/vision-ocr',
      ),
      createInternalAction(
        'embedding',
        '向量化',
        '/internal/ai-model-calls/embedding',
      ),
    ],
  },
];

const HTTP_METHOD_MAP: Record<string, string> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
};

const DEFAULT_ACTION_LABEL_MAP: Record<string, string> = {
  read: '查看',
  list: '查询',
  create: '新增',
  update: '编辑',
  delete: '删除',
  batchDelete: '批量删除',
};

const ROUTE_FALLBACK_META_MAP: Record<
  string,
  {
    moduleId?: string;
    moduleName: string;
    tableName?: string;
    isSystem?: boolean;
  }
> = {
  '/auth': { moduleId: 'auth', moduleName: '登录鉴权', isSystem: true },
  '/ai-feature-configs': {
    moduleId: 'ai-feature-configs',
    moduleName: 'AI 功能配置',
    isSystem: true,
  },
  '/data-import': {
    moduleId: 'data-import',
    moduleName: '数据导入',
    isSystem: true,
  },
  '/external-apps': { moduleId: 'external-apps', moduleName: '聊天应用' },
  '/knowledge-ai-chat': {
    moduleId: 'knowledge-ai-chat',
    moduleName: 'AI 问答会话',
  },
  '/knowledge-ai-providers': {
    moduleId: 'knowledge-ai-providers',
    moduleName: 'AI 大模型账号',
    isSystem: true,
  },
  '/knowledge-bases': { moduleId: 'knowledge-bases', moduleName: '知识库管理' },
  '/knowledge-retrieval-configs': {
    moduleId: 'knowledge-retrieval-configs',
    moduleName: '知识库检索配置',
    isSystem: true,
  },
  '/log-records': {
    moduleId: 'log-records',
    moduleName: '操作日志',
    isSystem: true,
  },
  '/menus': { moduleId: 'menu', moduleName: '菜单管理', isSystem: true },
  '/mineru-configs': {
    moduleId: 'mineru-configs',
    moduleName: 'MinerU 解析配置',
    isSystem: true,
  },
  '/module-models': {
    moduleId: 'module-models',
    moduleName: '模块字段源',
    isSystem: true,
  },
  '/storage-config': {
    moduleId: 'storage-config',
    moduleName: 'OSS/CDN 配置',
    isSystem: true,
  },
  '/uploads': { moduleId: 'uploads', moduleName: '文件上传', isSystem: true },
};

export function scanLogApiModules(): ScannedLogModule[] {
  const srcRoot = resolveSourceRoot();
  if (!srcRoot) return [];

  const modules = listControllerFiles(srcRoot)
    .map((file) => scanControllerFile(srcRoot, file))
    .filter((item): item is ScannedLogModule => Boolean(item));

  return [...modules, ...INTERNAL_LOG_MODULES].sort((a, b) =>
    a.moduleName.localeCompare(b.moduleName),
  );
}

function createInternalAction(
  action: string,
  label: string,
  path: string,
): ScannedLogApi {
  return {
    action,
    label,
    method: INTERNAL_METHOD,
    path,
    pathPattern: createPathPattern(path),
  };
}

function resolveSourceRoot() {
  const candidates = [
    resolve(process.cwd(), 'src'),
    resolve(process.cwd(), 'server', 'src'),
    resolve(__dirname, '..'),
  ];
  return candidates.find((item) => existsSync(join(item, 'app.module.ts')));
}

function listControllerFiles(root: string): string[] {
  const result: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.controller.ts')) {
        result.push(fullPath);
      }
    }
  };
  walk(root);
  return result;
}

function scanControllerFile(
  root: string,
  file: string,
): ScannedLogModule | null {
  const content = readFileSync(file, 'utf8');
  const controllerPath = readControllerPath(content);
  if (!controllerPath) return null;

  const routePath = normalizeRoute(controllerPath);
  const meta = Object.values(MODULE_MODEL_MAP).find(
    (item) => normalizeRoute(item.routePath) === routePath,
  );
  const fallback = ROUTE_FALLBACK_META_MAP[routePath];
  const moduleId =
    meta?.moduleId ?? fallback?.moduleId ?? toModuleId(routePath);
  const actions = readControllerActions(content, routePath);

  return {
    moduleId,
    moduleName:
      meta?.moduleName ?? fallback?.moduleName ?? toDisplayName(moduleId),
    modelName: meta?.modelName ?? '',
    tableName: meta?.tableName ?? fallback?.tableName ?? moduleId,
    routePath,
    sourceFile: relative(root, file).split(sep).join('/'),
    isSystem: fallback?.isSystem ?? false,
    actions,
  };
}

function readControllerPath(content: string) {
  const match = content.match(
    /@Controller\s*\(\s*(?:['"`]([^'"`]+)['"`]|\{[\s\S]*?path\s*:\s*['"`]([^'"`]+)['"`])/,
  );
  return match?.[1] ?? match?.[2] ?? '';
}

function readControllerActions(
  content: string,
  routePath: string,
): ScannedLogApi[] {
  const regex =
    /@(Get|Post|Put|Patch|Delete)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
  const matches = Array.from(content.matchAll(regex));

  return matches.map((match, index) => {
    const methodName = match[1];
    const method = HTTP_METHOD_MAP[methodName] ?? methodName.toUpperCase();
    const childPath = match[2] ?? '';
    const fullPath = joinRoute(routePath, childPath);
    const segmentEnd = matches[index + 1]?.index ?? content.length;
    const segment = content.slice(match.index ?? 0, segmentEnd);
    const summary = readApiSummary(segment);
    const action = resolveActionKey(method, normalizeRoute(childPath), summary);

    return {
      action,
      label: summary || DEFAULT_ACTION_LABEL_MAP[action] || action,
      method,
      path: fullPath,
      pathPattern: createPathPattern(fullPath),
    };
  });
}

function readApiSummary(segment: string) {
  const match = segment.match(
    /@ApiOperation\s*\(\s*\{[\s\S]*?summary\s*:\s*['"`]([^'"`]+)['"`]/,
  );
  return match?.[1] ?? '';
}

function resolveActionKey(method: string, childPath: string, summary: string) {
  if (method === 'GET') {
    return childPath && childPath !== '/' ? 'read' : 'list';
  }
  if (method === 'POST') {
    if (childPath === '/batch-delete') return 'batchDelete';
    return toActionKey(childPath) || 'create';
  }
  if (method === 'PATCH' || method === 'PUT') {
    return childPath === '/' || childPath === '/:id'
      ? 'update'
      : toActionKey(childPath) || 'update';
  }
  if (method === 'DELETE') {
    return childPath === '/' || childPath === '/:id'
      ? 'delete'
      : toActionKey(childPath) || 'delete';
  }
  return toActionKey(summary) || method.toLowerCase();
}

function toActionKey(value: string) {
  const parts = value
    .split('/')
    .filter(Boolean)
    .filter((item) => !item.startsWith(':'));
  const last = parts.at(-1) ?? '';
  return last.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function normalizeRoute(value: string) {
  const route = value.trim().replace(/^\/+|\/+$/g, '');
  return route ? `/${route}` : '/';
}

function joinRoute(parent: string, child: string) {
  const normalizedParent = normalizeRoute(parent);
  const normalizedChild = child.trim().replace(/^\/+|\/+$/g, '');
  return normalizedChild
    ? `${normalizedParent}/${normalizedChild}`
    : normalizedParent;
}

function createPathPattern(route: string) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/:([A-Za-z0-9_]+)/g, '[^/]+');
  return new RegExp(`^${pattern}$`);
}

function toModuleId(routePath: string) {
  return routePath.replace(/^\/+/, '').replace(/\//g, '-');
}

function toDisplayName(moduleId: string) {
  return moduleId
    .split('-')
    .filter(Boolean)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(' ');
}
