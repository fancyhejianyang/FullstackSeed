import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as vue from 'vue';
import { parse } from '@vue/compiler-sfc';
import ts from 'typescript';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const generator = await read('./Generate.vue');
const index = await read('./Index.vue');
const requestHelper = await read('./generationRequest.ts');
test('生成说明不再把新闻来源与日期作为成稿前置要求', () => {
  assert.match(generator, /按已保存的标题、想法和模板直接成稿/);
  assert.doesNotMatch(
    generator,
    /新闻类请先在想法中提供来源|素材不足时在生成记录中提示补充/,
  );
});
async function flush() {
  for (let i = 0; i < 16; i++) await Promise.resolve();
  await vue.nextTick();
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function harness(list = false) {
  const props = vue.reactive({ row: null });
  const visible = vue.ref(false);
  const calls = [];
  const state = {
    detail: { id: 1, title: '标题', idea: '想法', content: '原文', version: 4 },
    configs: {
      list: [
        { id: 5, name: '创作配置', model: 'model-a', responseFormat: 'text' },
      ],
      total: 1,
    },
    templates: { list: [{ id: 8, name: '热点解读' }], total: 1 },
    result: { id: 20, status: 'pending' },
    configError: false,
    detailError: false,
    submitError: false,
    templatePermission: true,
    updatePermission: true,
  };
  const api = {
    getContentArticle: async (id) => {
      calls.push(['detail', id]);
      if (state.detailError) throw Error('detail');
      return await state.detail;
    },
    getContentGenerationConfigs: async (query) => {
      calls.push(['configs', query]);
      if (state.configError) throw Error('configs');
      return await state.configs;
    },
    generateContentArticle: async (id, data) => {
      calls.push(['generate', id, data]);
      if (state.submitError) throw Error('network');
      return await state.result;
    },
    // 生成入口不应创建/修改文章。
    createContentArticle: () => assert.fail('must not create article'),
    updateContentArticle: () => assert.fail('must not update article'),
  };
  const exports = {};
  const unmount = [];
  const scope = vue.effectScope();
  const script =
    parse(list ? index : generator).descriptor.scriptSetup.content +
    (list
      ? '\nexport { canGenerate, openGenerate, generateVisible, generatingRow, generatingId, submitted, tableRef };'
      : '\nexport { form, formRef, fields, article, ready, loadFailed, submitting, configOptions, templateOptions, fetchConfigs, fetchTemplates, generate, canLeave, requestClose, beforeClose };');
  const js = ts.transpileModule(script, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  scope.run(() =>
    new Function(
      'require',
      'exports',
      'defineProps',
      'defineEmits',
      'defineModel',
      'window',
      js,
    )(
      (name) => {
        if (name === 'vue')
          return {
            ...vue,
            onMounted: () => {},
            onBeforeUnmount: (fn) => unmount.push(fn),
          };
        if (name === 'vue-router')
          return {
            onBeforeRouteLeave: () => {},
            useRouter: () => ({
              push: async (target) => calls.push(['navigate', target]),
            }),
          };
        if (name === 'element-plus')
          return {
            ElMessage: {
              warning: (message) => calls.push(['warning', message]),
              success: (message) => calls.push(['success', message]),
            },
          };
        if (name === '@/api/contentArticle') return api;
        if (name === './generationRequest') {
          const module = {};
          const code = ts.transpileModule(requestHelper, {
            compilerOptions: {
              module: ts.ModuleKind.CommonJS,
              target: ts.ScriptTarget.ES2022,
            },
          }).outputText;
          new Function('require', 'exports', code)(() => api, module);
          return module;
        }
        if (name === '@/api/contentTemplate')
          return {
            getContentTemplates: async (query) => {
              calls.push(['templates', query]);
              return await state.templates;
            },
          };
        if (name === '@/stores/user')
          return {
            useUserStore: () => ({
              hasPermission: (code) =>
                code === 'ContentTemplate.read'
                  ? state.templatePermission
                  : state.updatePermission,
            }),
          };
        if (name === './taskState')
          return {
            isActiveTask: (task) =>
              ['pending', 'running'].includes(task?.status),
          };
        if (name === '@/utils/format' || name.endsWith('.vue')) return {};
        throw Error(name);
      },
      exports,
      () => props,
      () =>
        (...args) =>
          calls.push(['emit', ...args]),
      () => visible,
      { addEventListener() {}, removeEventListener() {} },
    ),
  );
  if (!list)
    exports.formRef.value = {
      validate: async () =>
        !!exports.form.aiConfigId || Promise.reject(Error('required')),
    };
  return {
    ...exports,
    props,
    visible,
    calls,
    state,
    open: async () => {
      props.row = { id: 1, title: '标题', latestTask: null };
      visible.value = true;
      await flush();
    },
    close: () => {
      unmount.forEach((fn) => fn());
      scope.stop();
    },
  };
}

test('打开仅读取素材/选项，单配置自动选中，不触发模型或保存', async () => {
  const h = harness();
  await h.open();
  assert.equal(h.form.aiConfigId, '5');
  assert.match(h.configOptions.value[0].text, /纯文本/);
  assert.equal(h.form.templateId, null);
  assert.deepEqual(
    h.fields.value.map((field) => field.prop),
    ['aiConfigId', 'templateId'],
  );
  assert.equal(h.ready.value, true);
  assert.equal(
    h.calls.some((call) => call[0] === 'generate'),
    false,
  );
  h.close();
});

test('多个配置需选择；提交携带指定配置/模板/最新版本，原文不被覆盖', async () => {
  const h = harness();
  h.state.configs = {
    list: [
      { id: 5, name: 'A', model: 'a' },
      { id: 9, name: 'B', model: 'b' },
    ],
    total: 2,
  };
  await h.open();
  assert.equal(h.form.aiConfigId, null);
  await h.generate();
  assert.equal(
    h.calls.some((call) => call[0] === 'generate'),
    false,
  );
  h.form.aiConfigId = '9';
  h.form.templateId = '8';
  await h.generate();
  const [, id, data] = h.calls.find((call) => call[0] === 'generate');
  assert.equal(id, 1);
  assert.equal(data.aiConfigId, 9);
  assert.equal(data.templateId, 8);
  assert.equal(data.version, 4);
  assert.match(data.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(h.state.detail.content, '原文');
  assert.equal(h.visible.value, false);
  assert.ok(
    h.calls.some((call) => call[0] === 'emit' && call[1] === 'submitted'),
  );
  h.close();
});

test('缺配置、详情失败、空想法、活跃任务和无更新权限均不提交', async () => {
  for (const scenario of [
    'empty',
    'configs-failed',
    'detail-failed',
    'blank',
    'active',
    'permission',
  ]) {
    const h = harness();
    if (scenario === 'empty') h.state.configs = { list: [], total: 0 };
    if (scenario === 'configs-failed') h.state.configError = true;
    if (scenario === 'detail-failed') h.state.detailError = true;
    if (scenario === 'blank') h.state.detail.idea = ' ';
    if (scenario === 'permission') h.state.updatePermission = false;
    await h.open();
    if (scenario === 'active') h.props.row.latestTask = { status: 'running' };
    await h.generate();
    assert.equal(
      h.calls.some((call) => call[0] === 'generate'),
      false,
      scenario,
    );
    h.close();
  }
});

test('同一选择网络重试复用请求号；更换配置使用新请求号', async () => {
  const h = harness();
  await h.open();
  h.state.submitError = true;
  await h.generate();
  await h.generate();
  h.form.aiConfigId = '9';
  await h.generate();
  const requests = h.calls
    .filter((call) => call[0] === 'generate')
    .map((call) => call[2]);
  assert.equal(requests[0].requestId, requests[1].requestId);
  assert.notEqual(requests[1].requestId, requests[2].requestId);
  assert.equal(h.visible.value, true);
  h.close();
});

test('提交期间禁重复与误关闭，任务落库后可离开', async () => {
  const h = harness();
  const wait = deferred();
  h.state.result = wait.promise;
  await h.open();
  const first = h.generate();
  const duplicate = h.generate();
  await flush();
  await duplicate;
  await h.generate();
  assert.equal(h.calls.filter((call) => call[0] === 'generate').length, 1);
  let closed = false;
  h.beforeClose(() => {
    closed = true;
  });
  assert.equal(closed, false);
  h.requestClose();
  assert.equal(h.visible.value, true);
  wait.resolve({ id: 20, status: 'pending' });
  await first;
  assert.equal(h.canLeave(), true);
  h.close();
});

test('无模板读取权限不请求模板；不得静默丢弃已保存模板', async () => {
  const h = harness();
  h.state.templatePermission = false;
  await h.open();
  assert.equal(
    h.calls.some((call) => call[0] === 'templates'),
    false,
  );
  assert.deepEqual(
    h.fields.value.map((field) => field.prop),
    ['aiConfigId'],
  );
  h.form.templateId = '8';
  await h.generate();
  assert.equal(
    h.calls.some((call) => call[0] === 'generate'),
    false,
  );
  h.form.templateId = null;
  await h.generate();
  assert.equal(
    h.calls.find((call) => call[0] === 'generate')[2].templateId,
    undefined,
  );
  h.close();
});

test('搜索保留已选项，迟到查询不能覆盖最新搜索或新文章', async () => {
  const h = harness();
  await h.open();
  const old = deferred();
  h.state.configs = old.promise;
  const search = h.fetchConfigs('旧');
  h.state.configs = { list: [{ id: 9, name: '新配置', model: 'b' }], total: 1 };
  await h.fetchConfigs('新');
  old.resolve({ list: [{ id: 10, name: '过时', model: 'c' }], total: 1 });
  await search;
  assert.deepEqual(
    h.configOptions.value.map((item) => item.value),
    ['5', '9'],
  );
  const detail = deferred();
  h.state.detail = detail.promise;
  h.props.row = { id: 2 };
  await flush();
  h.state.detail = {
    id: 3,
    title: '第三篇',
    idea: '想法',
    content: '',
    version: 6,
  };
  h.props.row = { id: 3 };
  await flush();
  detail.resolve({ id: 2, title: '过时', idea: '', content: '', version: 1 });
  await flush();
  assert.equal(h.article.value.id, 3);
  h.close();
});

test('卸载后任务响应不再发出刷新或成功事件', async () => {
  const h = harness();
  await h.open();
  const wait = deferred();
  h.state.result = wait.promise;
  const pending = h.generate();
  await flush();
  h.close();
  wait.resolve({ id: 20, status: 'pending' });
  await pending;
  assert.equal(
    h.calls.some((call) => call[0] === 'emit'),
    false,
  );
  assert.equal(
    h.calls.some((call) => call[0] === 'success'),
    false,
  );
});

test('行内和顶部共用入口；零选/多选/活跃任务/无权限均不打开生成', async () => {
  const h = harness(true);
  const row = { id: 1, latestTask: null };
  for (const rows of [
    [],
    [row, { id: 2 }],
    [{ ...row, latestTask: { status: 'pending' } }],
  ]) {
    assert.equal(h.canGenerate(rows), false);
    await h.openGenerate(rows);
    assert.equal(h.generateVisible.value, false);
  }
  h.state.updatePermission = false;
  await h.openGenerate([row]);
  assert.equal(h.generateVisible.value, false);
  h.state.updatePermission = true;
  await h.openGenerate([row]);
  assert.equal(h.generateVisible.value, true);
  assert.equal(h.generatingRow.value.id, 1);
  assert.match(index, /#toolbar="\{ selectedRows \}"/);
  assert.match(index, /@click="openGenerate\(selectedRows\)"/);
  assert.match(index, /@click="openGenerate\(\[row\]\)"/);
  assert.match(index, /:action-width="260"/);
  h.close();
});

test('编辑页保留内容字段和生成设置，记录移到独立页，保存不生成', async () => {
  const editor = await read('./Edit.vue');
  assert.doesNotMatch(
    editor,
    /generateContentArticle|保存并生成|getContentTemplates/,
  );
  assert.doesNotMatch(editor, /<Tasks/);
  assert.match(editor, /<GenerationSettings/);
});

test('已记住的配置和模板直接提交最新文章版本，不再弹窗或加载选项', async () => {
  const h = harness(true);
  Object.assign(h.state.detail, { aiConfigId: 5, templateId: 8 });
  await h.openGenerate([{ id: 1, latestTask: null }]);
  assert.equal(h.generateVisible.value, false);
  const request = h.calls.find((call) => call[0] === 'generate')[2];
  assert.equal(request.aiConfigId, 5);
  assert.equal(request.templateId, 8);
  assert.equal(request.version, 4);
  assert.equal(
    h.calls.some((call) => ['configs', 'templates'].includes(call[0])),
    false,
  );
  h.close();
});

test('通用写作也记住配置；模板权限撤销不回退通用模板', async () => {
  for (const templateId of [null, 8]) {
    const h = harness(true);
    Object.assign(h.state.detail, { aiConfigId: 5, templateId });
    h.state.templatePermission = false;
    await h.openGenerate([{ id: 1, latestTask: null }]);
    assert.equal(
      h.calls.some((call) => call[0] === 'generate'),
      templateId === null,
    );
    h.close();
  }
});

test('直接生成期间阻止重复点击；网络失败后重放相同版本和请求号', async () => {
  const h = harness(true);
  Object.assign(h.state.detail, { aiConfigId: 5, templateId: 8 });
  const wait = deferred();
  h.state.result = wait.promise;
  const row = { id: 1, latestTask: null };
  const first = h.openGenerate([row]);
  await flush();
  await h.openGenerate([row]);
  assert.equal(h.calls.filter((call) => call[0] === 'generate').length, 1);
  wait.resolve({ id: 20, status: 'pending' });
  await first;
  h.state.submitError = true;
  await h.openGenerate([row]);
  h.state.detail.version = 5;
  await h.openGenerate([row]);
  const requests = h.calls
    .filter((call) => call[0] === 'generate')
    .map((call) => call[2]);
  assert.deepEqual(requests[1], requests[2]);
  assert.notEqual(requests[0].requestId, requests[1].requestId);
  assert.equal(h.generatingId.value, null);
  h.close();
});

test('直接生成配置失效时保留设置，不改选其它模型或自动重试', async () => {
  const h = harness(true);
  Object.assign(h.state.detail, { aiConfigId: 9, templateId: 8 });
  h.state.submitError = true;
  await h.openGenerate([{ id: 1, latestTask: null }]);
  assert.equal(h.calls.filter((call) => call[0] === 'generate').length, 1);
  assert.equal(h.calls.find((call) => call[0] === 'generate')[2].aiConfigId, 9);
  assert.equal(h.state.detail.aiConfigId, 9);
  assert.equal(h.generateVisible.value, false);
  h.close();
});
