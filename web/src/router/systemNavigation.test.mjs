import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as vue from 'vue';
import * as vueRouter from 'vue-router';
import { parse, compileTemplate } from '@vue/compiler-sfc';
import ts from 'typescript';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const source = await read('./index.ts');
const compile = (text) =>
  ts.transpileModule(text, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

function routerHarness(permissions = [], isAdmin = false) {
  const calls = [];
  const user = {
    token: 'test',
    loaded: false,
    isAdmin,
    permissions: [],
    hasPermission(code) {
      return this.isAdmin || this.permissions.includes(code);
    },
    async bootstrap() {
      calls.push('bootstrap');
      this.loaded = true;
      this.permissions = permissions;
    },
    logout() {},
  };
  const exports = {};
  // 运行真实路由和守卫，只替换历史实现和懒加载视图，避免启动浏览器/服务。
  const code = source
    .replace(/import\.meta\.env\.BASE_URL/g, "'/'")
    .replace(
      /\(\)\s*=>\s*import\(['"][^'"]+['"]\)/g,
      '{ render() { return null; } }',
    );
  new Function('require', 'exports', compile(code))((name) => {
    if (name === 'vue-router')
      return { ...vueRouter, createWebHistory: vueRouter.createMemoryHistory };
    if (name === 'element-plus')
      return { ElMessage: { warning: (message) => calls.push(message) } };
    if (name === '@/stores/user') return { useUserStore: () => user };
    throw new Error(`Unexpected import ${name}`);
  }, exports);
  return { router: exports.default, user, calls };
}

test('内容创作路由仅允许 ContentArticle.read，不继承 Agent 或菜单权限', async () => {
  for (const permissions of [
    [],
    ['Menu.read'],
    ['AgentWorkspace.read'],
    ['ContentArticle.read'],
  ]) {
    const h = routerHarness(permissions);
    await h.router.push('/content-articles');
    assert.equal(
      h.router.currentRoute.value.path,
      permissions.includes('ContentArticle.read') ? '/content-articles' : '/',
    );
  }
});

test('cold navigation to system groups waits for permissions before picking a page', async () => {
  for (const [permissions, target, expected] of [
    [['DashboardConfig.read'], '/system-config', '/system-config/home'],
    [['Menu.read'], '/system-config', '/menus'],
    [['DataImport.read'], '/system-config', '/system-config/data-import'],
    [['User.read'], '/access-control', '/users'],
    [['Role.read'], '/access-control', '/roles'],
    [['Permission.read'], '/access-control', '/permissions'],
    [['LogRecord.read'], '/access-control', '/system-config/log-record'],
    [[], '/access-control', '/'],
  ]) {
    const h = routerHarness(permissions);
    await h.router.push(target);
    assert.equal(h.router.currentRoute.value.path, expected);
    assert.equal(h.calls.filter((x) => x === 'bootstrap').length, 1);
  }
});

test('legacy scope address redirects without granting access; new log/import routes reject Menu.read', async () => {
  const h = routerHarness(['Menu.read']);
  await h.router.push('/system-config/menu');
  assert.equal(h.router.currentRoute.value.path, '/menus');
  assert.equal(h.router.currentRoute.value.query.tab, 'scope');
  for (const path of [
    '/system-config/log-record',
    '/system-config/data-import',
  ]) {
    await h.router.push(path);
    assert.equal(h.router.currentRoute.value.path, '/');
  }
});

test('menu tabs only expose scope to admins and role containers do not duplicate module grants', async () => {
  const user = vue.reactive({ isAdmin: false });
  const route = vue.reactive({ query: { tab: 'scope' } });
  const menu = await read('../views/menu/Index.vue');
  const role = await read('../views/role/Edit.vue');
  function setup(sfc, names) {
    const exports = {};
    const script = sfc.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
    new Function(
      'require',
      'exports',
      'defineProps',
      'defineEmits',
      'defineModel',
      compile(`${script}\nexport { ${names.join(', ')} };`),
    )(
      (name) => {
        if (name === 'vue') return { ...vue, onMounted() {} };
        if (name === 'vue-router')
          return { useRoute: () => route, useRouter: () => ({ replace() {} }) };
        if (name === '@/stores/user') return { useUserStore: () => user };
        return {};
      },
      exports,
      () => ({}),
      () => () => {},
      () => vue.ref(false),
    );
    return exports;
  }
  const scope = vue.effectScope();
  try {
    const tabs = scope.run(() => setup(menu, ['activeTab']));
    assert.equal(tabs.activeTab.value, 'structure');
    user.isAdmin = true;
    assert.equal(tabs.activeTab.value, 'scope');
    const editor = scope.run(() =>
      setup(role, ['menuTree', 'basePermissions', 'permissionTreeData']),
    );
    editor.basePermissions.value = [
      { code: 'read', name: '查看' },
      { code: 'update', name: '编辑' },
    ];
    editor.menuTree.value = [
      {
        id: 1,
        name: '权限与审计',
        isActive: true,
        isSystem: false,
        permissionCode: 'User.read,LogRecord.read',
        children: [
          {
            id: 2,
            name: '操作日志',
            isActive: true,
            isSystem: false,
            permissionCode: 'LogRecord.read',
            children: [],
          },
          {
            id: 3,
            name: '停用项',
            isActive: false,
            isSystem: false,
            permissionCode: 'User.read',
            children: [],
          },
          {
            id: 4,
            name: '超管项',
            isActive: true,
            isSystem: true,
            permissionCode: 'Role.read',
            children: [],
          },
        ],
      },
    ];
    const tree = editor.permissionTreeData.value;
    assert.equal(tree[0].children.length, 1);
    assert.deepEqual(
      tree[0].children[0].children.map((x) => x.permissionCode),
      ['LogRecord.read', 'LogRecord.update'],
    );
  } finally {
    scope.stop();
  }
});

test('changed templates compile and read-only users retain labels without editing buttons', async () => {
  for (const file of [
    'menu/Index.vue',
    'menu/Scope.vue',
    'log-record/Index.vue',
    'data-import/Index.vue',
    'role/Edit.vue',
  ]) {
    const { descriptor } = parse(await read(`../views/${file}`));
    assert.deepEqual(
      compileTemplate({
        source: descriptor.template.content,
        filename: file,
        id: file,
      }).errors,
      [],
    );
  }
  const imports = await read('../views/data-import/Index.vue');
  assert.match(imports, /perm="DataImport.create"/);
  assert.match(imports, /perm="DataImport.update"/);
  assert.match(
    imports,
    /<span v-else>\s*\{\{ \(row as DataImportConfigItem\).moduleName \}\}\s*<\/span>/,
  );
  const logs = await read('../views/log-record/Index.vue');
  assert.match(logs, /perm="LogRecord.update"/);
  assert.doesNotMatch(logs, /Menu.read/);
});

test('Agent debug and old aliases require AgentApp.read instead of Menu.read', async () => {
  for (const path of [
    '/agent-management/debug',
    '/chat-management/ai-chat',
    '/system-config/ai-chat',
  ]) {
    const denied = routerHarness(['Menu.read', 'AgentWorkspace.read']);
    await denied.router.push(path);
    assert.equal(denied.router.currentRoute.value.path, '/');
    const allowed = routerHarness(['AgentApp.read', 'AgentWorkspace.read']);
    await allowed.router.push(path);
    assert.equal(
      allowed.router.currentRoute.value.path,
      '/agent-management/debug',
    );
  }
});

test('AI 配置中心与内容分组在 bootstrap 后选择有权限的页签', async () => {
  for (const [permissions, path, expected] of [
    [['AiCommandDefinition.read'], '/ai-config', '/ai-config/commands'],
    [['AiWorkflow.read'], '/ai-config', '/ai-config/workflows'],
    [['Menu.read'], '/ai-config', '/ai-config/features'],
    [[], '/ai-config', '/'],
    [['ContentTemplate.read'], '/content-creation', '/content-templates'],
    [['ContentArticle.read'], '/content-creation', '/content-articles'],
    [['Menu.read'], '/content-creation', '/'],
  ]) {
    const h = routerHarness(permissions);
    await h.router.push(path);
    assert.equal(h.router.currentRoute.value.path, expected);
    assert.equal(h.calls.filter((call) => call === 'bootstrap').length, 1);
  }
});

test('旧 AI 地址仍可访问，跨页签不能扩大权限', async () => {
  for (const [path, permission, expected] of [
    ['/chat-management/ai-configs', 'Menu.read', '/ai-config/features'],
    [
      '/agent-management/commands',
      'AiCommandDefinition.read',
      '/ai-config/commands',
    ],
    [
      '/chat-management/commands',
      'AiCommandDefinition.read',
      '/ai-config/commands',
    ],
    ['/agent-management/workflows', 'AiWorkflow.read', '/ai-config/workflows'],
    ['/chat-management/workflows', 'AiWorkflow.read', '/ai-config/workflows'],
  ]) {
    const allowed = routerHarness([permission]);
    await allowed.router.push(path);
    assert.equal(allowed.router.currentRoute.value.path, expected);
    const denied = routerHarness([
      'AgentWorkspace.read',
      'ContentArticle.read',
    ]);
    await denied.router.push(path);
    assert.equal(denied.router.currentRoute.value.path, '/');
  }
});

test('AI 页签只挂载当前有权页面，模板不能继承文章权限', async () => {
  const source = await read('../views/ai-config/Index.vue');
  const exports = {};
  const props = vue.reactive({ section: 'features' });
  const user = { hasPermission: (code) => code === 'AiCommandDefinition.read' };
  const script =
    parse(source).descriptor.scriptSetup.content +
    '\nexport { visibleTabs, current };';
  new Function('require', 'exports', 'defineProps', compile(script))(
    (name) => {
      if (name === 'vue') return vue;
      if (name === 'vue-router') return { useRouter: () => ({ push() {} }) };
      if (name === '@/stores/user') return { useUserStore: () => user };
      throw Error(name);
    },
    exports,
    () => props,
  );
  assert.deepEqual(
    exports.visibleTabs.value.map((tab) => tab.key),
    ['commands'],
  );
  assert.equal(exports.current.value, undefined);
  props.section = 'commands';
  assert.equal(exports.current.value.key, 'commands');
  const h = routerHarness(['ContentArticle.read']);
  await h.router.push('/content-templates');
  assert.equal(h.router.currentRoute.value.path, '/');
});
