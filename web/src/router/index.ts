import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/stores/user';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/HomeView.vue'),
        meta: { title: '首页' },
      },
      {
        path: 'agent-management',
        name: 'agent-management',
        redirect: '/agent-management/workspace',
        meta: { title: 'Agent 管理', permission: 'AgentWorkspace.read' },
      },
      {
        path: 'agent-management/workspace',
        name: 'agent-workspace',
        component: () => import('@/views/agent-workspace/Index.vue'),
        meta: { title: 'Agent 工作台', permission: 'AgentWorkspace.read' },
      },
      {
        path: 'agent-workspace',
        redirect: '/agent-management/workspace',
      },
      {
        path: 'demo',
        name: 'demo',
        component: () => import('@/views/demo/Index.vue'),
        meta: { title: '示例管理', permission: 'Demo.read' },
      },
      {
        path: 'knowledge-bases',
        name: 'knowledge-bases',
        redirect: '/knowledge-bases/categories',
        meta: { title: '知识库管理', permission: 'KnowledgeBase.read' },
      },
      {
        path: 'knowledge-bases/categories',
        name: 'knowledge-base-categories',
        component: () => import('@/views/knowledge-base/Categories.vue'),
        meta: { title: '知识库分类', permission: 'KnowledgeBase.read' },
      },
      {
        path: 'knowledge-bases/list',
        name: 'knowledge-base-list',
        component: () => import('@/views/knowledge-base/Index.vue'),
        meta: { title: '知识库列表', permission: 'KnowledgeBase.read' },
      },
      {
        path: 'knowledge-bases/documents',
        name: 'knowledge-base-documents',
        component: () => import('@/views/knowledge-base/Documents.vue'),
        meta: { title: '知识库文档', permission: 'KnowledgeBase.read' },
      },
      {
        path: 'knowledge-bases/chunk-configs',
        name: 'knowledge-chunk-configs',
        component: () => import('@/views/knowledge-chunk-config/Index.vue'),
        meta: { title: '分片配置', permission: 'KnowledgeBase.read' },
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/views/user/Index.vue'),
        meta: { title: '账号管理', permission: 'User.read' },
      },
      {
        path: 'roles',
        name: 'roles',
        component: () => import('@/views/role/Index.vue'),
        meta: { title: '角色管理', permission: 'Role.read' },
      },
      {
        path: 'permissions',
        name: 'permissions',
        component: () => import('@/views/permission/Index.vue'),
        meta: { title: '权限定义', permission: 'Permission.read' },
      },
      {
        path: 'menus',
        name: 'menus',
        component: () => import('@/views/menu/Index.vue'),
        meta: { title: '菜单管理', permission: 'Menu.read' },
      },
      {
        path: 'system-config',
        name: 'system-config',
        // 等全局守卫完成会话加载后，再进入当前账号可访问的子页。
        children: [],
        beforeEnter: () => {
          const user = useUserStore();
          if (user.hasPermission('DashboardConfig.read'))
            return '/system-config/home';
          if (user.hasPermission('Menu.read')) return '/menus';
          return user.hasPermission('DataImport.read')
            ? '/system-config/data-import'
            : '/';
        },
        meta: { title: '系统配置' },
      },
      {
        path: 'access-control',
        name: 'access-control',
        children: [],
        beforeEnter: () => {
          const user = useUserStore();
          if (user.hasPermission('User.read')) return '/users';
          if (user.hasPermission('Role.read')) return '/roles';
          if (user.hasPermission('Permission.read')) return '/permissions';
          return user.hasPermission('LogRecord.read')
            ? '/system-config/log-record'
            : '/';
        },
        meta: { title: '权限与审计' },
      },
      {
        path: 'system-config/menu',
        name: 'system-config-menu',
        redirect: { path: '/menus', query: { tab: 'scope' } },
      },
      {
        path: 'system-config/home',
        name: 'dashboard-config',
        component: () => import('@/views/dashboard-config/Index.vue'),
        meta: { title: '首页配置', permission: 'DashboardConfig.read' },
      },
      {
        path: 'third-party-config',
        redirect: '/third-party-config/overview',
      },
      {
        path: 'third-party-config/overview',
        name: 'third-party-config-overview',
        component: () => import('@/views/third-party-config/Index.vue'),
        meta: { title: '第三方配置' },
      },
      {
        path: 'third-party-config/ai',
        name: 'system-config-ai',
        component: () => import('@/views/knowledge-ai-provider/Index.vue'),
        meta: {
          title: 'AI 大模型账号',
          permission: 'KnowledgeAiProvider.read',
        },
      },
      {
        path: 'chat-management',
        name: 'chat-management',
        redirect: '/chat-management/apps',
        meta: { title: '聊天管理', permission: 'Menu.read' },
      },
      {
        path: 'business-data',
        name: 'business-data',
        redirect: '/business-data/products',
        meta: { title: '业务数据', permission: 'Product.read' },
      },
      {
        path: 'collaboration-center',
        name: 'collaboration-center',
        redirect: '/collaboration-center/approvals',
        meta: { title: '协作中心', permission: 'ApprovalRequest.read' },
      },
      {
        path: 'collaboration-center/approvals',
        name: 'collaboration-center-approvals',
        component: () => import('@/views/approval-request/Index.vue'),
        meta: { title: '审批管理', permission: 'ApprovalRequest.read' },
      },
      {
        path: 'agent-management/debug',
        name: 'agent-management-debug',
        component: () => import('@/views/knowledge-ai-chat/Index.vue'),
        meta: { title: 'Agent 调试', permission: 'Menu.read' },
      },
      {
        path: 'chat-management/ai-chat',
        redirect: '/agent-management/debug',
      },
      {
        path: 'agent-management/apps',
        name: 'agent-management-apps',
        component: () => import('@/views/agent-app/Index.vue'),
        meta: { title: 'Agent 应用管理', permission: 'AgentApp.read' },
      },
      {
        path: 'chat-management/agent-apps',
        redirect: '/agent-management/apps',
      },
      {
        path: 'agent-management/executions',
        name: 'agent-management-executions',
        component: () => import('@/views/agent-app/Records.vue'),
        meta: { title: 'Agent 执行记录', permission: 'AgentApp.read' },
      },
      {
        path: 'chat-management/agent-executions',
        redirect: '/agent-management/executions',
      },
      {
        path: 'business-data/products',
        name: 'business-data-products',
        component: () => import('@/views/product/Index.vue'),
        meta: { title: '产品库', permission: 'Product.read' },
      },
      {
        path: 'business-data/product-skus',
        name: 'business-data-product-skus',
        component: () => import('@/views/product-sku/Index.vue'),
        meta: { title: 'SKU 库', permission: 'ProductSku.read' },
      },
      {
        path: 'chat-management/apps',
        name: 'chat-management-apps',
        component: () => import('@/views/external-app/Index.vue'),
        meta: { title: '聊天应用', permission: 'Menu.read' },
      },
      {
        path: 'customer-service',
        name: 'customer-service',
        component: () => import('@/views/customer-service/Index.vue'),
        meta: { title: '客服工作台', permission: 'CustomerService.read' },
      },
      {
        path: 'chat-management/ai-configs',
        name: 'chat-management-ai-configs',
        component: () => import('@/views/ai-feature-config/Index.vue'),
        meta: { title: 'AI 功能配置', permission: 'Menu.read' },
      },
      {
        path: 'agent-management/commands',
        name: 'agent-management-commands',
        component: () => import('@/views/ai-command-definition/Index.vue'),
        meta: { title: 'AI 指令集', permission: 'AiCommandDefinition.read' },
      },
      {
        path: 'chat-management/commands',
        redirect: '/agent-management/commands',
      },
      {
        path: 'agent-management/workflows',
        name: 'agent-management-workflows',
        component: () => import('@/views/ai-workflow/Index.vue'),
        meta: { title: 'AI 工作流', permission: 'AiWorkflow.read' },
      },
      {
        path: 'chat-management/workflows',
        redirect: '/agent-management/workflows',
      },
      {
        path: 'chat-management/retrieval-configs',
        name: 'chat-management-retrieval-configs',
        component: () => import('@/views/knowledge-retrieval-config/Index.vue'),
        meta: { title: '知识库检索配置', permission: 'Menu.read' },
      },
      {
        path: 'chat-management/routing-rules',
        name: 'chat-management-routing-rules',
        component: () => import('@/views/knowledge-routing-rule/Index.vue'),
        meta: {
          title: '知识库路由规则',
          permission: 'KnowledgeRoutingRule.read',
        },
      },
      {
        path: 'chat-management/standard-qas',
        name: 'chat-management-standard-qas',
        component: () => import('@/views/knowledge-standard-qa/Index.vue'),
        meta: { title: '标准问答库', permission: 'KnowledgeStandardQa.read' },
      },
      {
        path: 'chat-management/colloquial-terms',
        name: 'chat-management-colloquial-terms',
        component: () => import('@/views/knowledge-colloquial-term/Index.vue'),
        meta: {
          title: '口语化表达词库',
          permission: 'KnowledgeColloquialTerm.read',
        },
      },
      {
        path: 'chat-management/records',
        name: 'chat-management-records',
        component: () => import('@/views/knowledge-ai-record/Index.vue'),
        meta: { title: '问答记录', permission: 'Menu.read' },
      },
      {
        path: 'system-config/ai-chat',
        name: 'system-config-ai-chat',
        component: () => import('@/views/knowledge-ai-chat/Index.vue'),
        meta: { title: 'Agent 调试', permission: 'Menu.read' },
      },
      {
        path: 'system-config/ai-record',
        name: 'system-config-ai-record',
        component: () => import('@/views/knowledge-ai-record/Index.vue'),
        meta: { title: '问题记录', permission: 'Menu.read' },
      },
      {
        path: 'third-party-config/wechat',
        name: 'system-config-wechat',
        component: () => import('@/views/system/Wechat.vue'),
        meta: { title: '微信 / 小程序', permission: 'WechatConfig.read' },
      },
      {
        path: 'system-config/log-record',
        name: 'system-config-log-record',
        component: () => import('@/views/log-record/Index.vue'),
        meta: { title: '操作日志', permission: 'LogRecord.read' },
      },
      {
        path: 'system-config/data-import',
        name: 'system-config-data-import',
        component: () => import('@/views/data-import/Index.vue'),
        meta: { title: '导入配置', permission: 'DataImport.read' },
      },
      {
        path: 'third-party-config/storage',
        name: 'system-config-storage',
        component: () => import('@/views/storage-config/Index.vue'),
        meta: { title: 'OSS/CDN 配置', permission: 'StorageConfig.read' },
      },
      {
        path: 'third-party-config/mineru',
        name: 'system-config-mineru',
        component: () => import('@/views/mineru-config/Index.vue'),
        meta: { title: 'MinerU 解析服务', permission: 'MineruConfig.read' },
      },
      {
        path: 'third-party-config/vector',
        name: 'system-config-vector',
        component: () => import('@/views/vector-config/Index.vue'),
        meta: { title: '向量化服务', permission: 'VectorConfig.read' },
      },
      {
        path: 'knowledge-bases/document-parse',
        name: 'system-config-document-parse',
        component: () => import('@/views/document-parse-rule/Index.vue'),
        meta: { title: '文档解析规则', permission: 'KnowledgeBase.read' },
      },
      ...['ai', 'wechat', 'storage', 'mineru', 'vector'].map((key) => ({
        path: 'system-config/' + key,
        redirect: '/third-party-config/' + key,
      })),
      {
        path: 'system-config/document-parse',
        redirect: '/knowledge-bases/document-parse',
      },
      {
        // 布局内兜底 404（保留侧边栏）
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('@/views/error/NotFound.vue'),
        meta: { title: '页面不存在' },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// 全局前置守卫：
// 1. 公开页直接放行
// 2. 未登录跳转登录页
// 3. 已登录但会话（用户信息 + 菜单）未加载时，先引导加载再放行；
//    引导失败（如 token 失效）则登出并跳登录页
router.beforeEach(async (to) => {
  const userStore = useUserStore();
  if (to.meta.public) {
    return true;
  }
  if (!userStore.token) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (!userStore.loaded) {
    try {
      await userStore.bootstrap();
    } catch {
      userStore.logout();
      return { path: '/login', query: { redirect: to.fullPath } };
    }
  }
  const permission = to.meta.permission;
  if (typeof permission === 'string' && !userStore.hasPermission(permission)) {
    ElMessage.warning('暂无权限访问该页面');
    return { path: '/' };
  }
  return true;
});

export default router;
