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
    .replace(/\(\) => import\('[^']+'\)/g, '{ render() { return null; } }');
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
