import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as vue from 'vue';
import { parse } from '@vue/compiler-sfc';
import ts from 'typescript';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const source = await read('./View.vue');
async function flush() {
  for (let i = 0; i < 16; i++) await Promise.resolve();
  await vue.nextTick();
}
function harness() {
  const props = vue.reactive({ row: { id: 3 } });
  const visible = vue.ref(false),
    calls = [],
    timers = new Map(),
    unmount = [],
    guards = [],
    listeners = new Map();
  const state = {
    updatePermission: true,
    adoptError: false,
    adopted: null,
    response: {
      article: { id: 3, title: '标题', content: '已保存的旧正文', version: 2 },
      latestTask: {
        id: 20,
        articleVersion: 2,
        status: 'succeeded',
        result: '最新生成稿',
      },
    },
  };
  const exports = {},
    scope = vue.effectScope();
  const code = ts.transpileModule(
    parse(source).descriptor.scriptSetup.content +
      '\nexport { load, preview, content, copyContent, generatedTitle, copyTitle, adopt, adoptTitle, canAdopt, adopting, adoptConfirmation, canLeave, beforeClose, requestClose, beforeUnload };',
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  scope.run(() =>
    new Function(
      'require',
      'exports',
      'defineProps',
      'defineEmits',
      'defineModel',
      'setTimeout',
      'clearTimeout',
      'navigator',
      'window',
      code,
    )(
      (name) => {
        if (name === 'vue')
          return {
            ...vue,
            onMounted: (cb) => cb(),
            onBeforeUnmount: (cb) => unmount.push(cb),
          };
        if (name === 'vue-router')
          return {
            onBeforeRouteLeave: (cb) => guards.push(cb),
            onBeforeRouteUpdate: (cb) => guards.push(cb),
          };
        if (name === '@/stores/user')
          return {
            useUserStore: () => ({
              hasPermission: () => state.updatePermission,
            }),
          };
        if (name === 'element-plus')
          return { ElMessage: { success() {}, warning() {} } };
        if (name === './taskState')
          return {
            isActiveTask: (task) =>
              ['pending', 'running'].includes(task?.status),
          };
        if (name === '@/api/contentArticle')
          return {
            getContentArticlePreview: async (id) => {
              calls.push(['read', id]);
              return structuredClone(await state.response);
            },
            adoptContentTask: async (id, version, adoptTitle) => {
              calls.push(['adopt', id, version, adoptTitle]);
              if (state.adoptError) throw Error('conflict');
              return state.adopted
                ? await state.adopted
                : {
                    ...state.response.article,
                    title: adoptTitle
                      ? state.response.latestTask.generatedTitle
                      : state.response.article.title,
                    content: state.response.latestTask.result,
                    version: version + 1,
                  };
            },
          };
        return {};
      },
      exports,
      () => props,
      () =>
        (...args) =>
          calls.push(['emit', ...args]),
      () => visible,
      (cb) => {
        const id = timers.size + 1;
        timers.set(id, cb);
        return id;
      },
      (id) => timers.delete(id),
      { clipboard: { writeText: async (text) => calls.push(['copy', text]) } },
      {
        addEventListener: (name, cb) => listeners.set(name, cb),
        removeEventListener: (name) => listeners.delete(name),
      },
    ),
  );
  return {
    ...exports,
    props,
    visible,
    calls,
    state,
    timers,
    guards,
    listeners,
    close() {
      unmount.forEach((fn) => fn());
      scope.stop();
    },
  };
}

test('文章每次打开查询最新结果，只展示和复制当前生成稿', async () => {
  const h = harness();
  h.visible.value = true;
  await flush();
  assert.equal(h.content.value, '最新生成稿');
  await h.copyContent();
  assert.deepEqual(h.calls.at(-1), ['copy', '最新生成稿']);
  h.visible.value = false;
  await flush();
  h.state.response.latestTask = {
    id: 21,
    status: 'succeeded',
    result: '再次生成稿',
  };
  h.visible.value = true;
  await flush();
  assert.equal(h.content.value, '再次生成稿');
  assert.equal(h.calls.filter(([kind]) => kind === 'read').length, 2);
  h.close();
});
test('最新失败/待补充/排队不能把旧正文或提示当成最新稿', async () => {
  const h = harness();
  h.visible.value = true;
  await flush();
  for (const status of [
    'failed',
    'needs_input',
    'pending',
    'running',
    'interrupted',
  ]) {
    h.state.response.latestTask = { id: 21, status, result: '不应使用的提示' };
    await h.load();
    await h.copyContent();
    assert.equal(h.content.value, '');
  }
  assert.equal(
    h.calls.some(([kind]) => kind === 'copy'),
    false,
  );
  h.close();
  assert.equal(h.timers.size, 0);
});
test('没有任务不回退已保存正文；读取失败清空旧内容，重新打开重读', async () => {
  const h = harness();
  h.state.response.latestTask = null;
  h.visible.value = true;
  await flush();
  assert.equal(h.content.value, '');
  assert.equal(h.canAdopt.value, false);
  h.state.response = Promise.reject(Error('network'));
  await h.load();
  assert.equal(h.preview.value, null);
  assert.equal(h.content.value, '');
  h.visible.value = false;
  await flush();
  h.state.response = {
    article: { id: 3, content: '修订内容' },
    latestTask: { id: 21, status: 'succeeded', result: '新生成内容' },
  };
  h.visible.value = true;
  await flush();
  assert.equal(h.content.value, '新生成内容');
  h.close();
});
test('活跃任务自动读取完成结果，停止轮询；关闭阻止迟到响应回填', async () => {
  const h = harness();
  h.state.response.latestTask.status = 'running';
  h.visible.value = true;
  await flush();
  assert.equal(h.timers.size, 1);
  h.state.response.latestTask = {
    id: 20,
    status: 'succeeded',
    result: '完成稿',
  };
  [...h.timers.values()][0]();
  await flush();
  assert.equal(h.content.value, '完成稿');
  assert.equal(h.timers.size, 0);
  let resolve;
  h.state.response = new Promise((done) => {
    resolve = done;
  });
  const pending = h.load();
  h.visible.value = false;
  await flush();
  resolve({ article: { content: '迟到' }, latestTask: null });
  await pending;
  assert.equal(h.preview.value, null);
  h.close();
});
test('切换文章时迟到响应不覆盖当前文章', async () => {
  const h = harness();
  let resolve;
  h.state.response = new Promise((done) => {
    resolve = done;
  });
  h.visible.value = true;
  await flush();
  h.state.response = {
    article: { id: 4, content: '' },
    latestTask: { id: 23, status: 'succeeded', result: '另一篇文章' },
  };
  h.props.row = { id: 4 };
  await flush();
  resolve({ article: { id: 3, content: '旧记录' }, latestTask: null });
  await flush();
  assert.equal(h.content.value, '另一篇文章');
  h.close();
});
test('文章列表和查看弹窗移除记录跳转、刷新及 Tab，独立记录模块保留', async () => {
  assert.doesNotMatch(
    source,
    /<Tasks|v-html|<el-tabs|<el-tab-pane|records|刷新|detail\.(idea|coverUrl|content|title)/,
  );
  assert.doesNotMatch(await read('./Edit.vue'), /<Tasks/);
  assert.match(
    await read('../content-generation/Index.vue'),
    /<PageContainer title="生成记录"/,
  );
  assert.match(await read('./Tasks.vue'), /:search-fields="searchFields"/);
  const index = await read('./Index.vue');
  assert.doesNotMatch(
    index,
    /openRecords|@records|生成记录|icon="Refresh"|>刷新/,
  );
  assert.match(index, /@adopted="submitted"/);
  assert.match(index, /:action-width="260"/);
  assert.match(source, /perm="ContentArticle.update"/);
  assert.match(source, /:confirm-text="adoptConfirmation"/);
  assert.match(source, /:before-close="beforeClose"/);
  assert.match(source, /采纳并保存/);
});

test('最新稿展示 AI 推荐标题，复制标题不混入正文或提示', async () => {
  const h = harness();
  h.state.response.latestTask.generatedTitle = 'AI 发布标题';
  h.visible.value = true;
  await flush();
  assert.equal(h.generatedTitle.value, 'AI 发布标题');
  await h.copyTitle();
  await h.copyContent();
  assert.deepEqual(
    h.calls.filter(([kind]) => kind === 'copy'),
    [
      ['copy', 'AI 发布标题'],
      ['copy', '最新生成稿'],
    ],
  );
  h.close();
});

test('旧记录与最新失败结果不把原标题或错误字段当生成标题', async () => {
  const h = harness();
  h.visible.value = true;
  await flush();
  assert.equal(h.generatedTitle.value, '');
  await h.copyTitle();
  h.state.response.latestTask = {
    id: 21,
    status: 'failed',
    generatedTitle: '不可用标题',
    result: '不可用正文',
  };
  await h.load();
  await h.copyTitle();
  assert.equal(h.generatedTitle.value, '');
  assert.equal(
    h.calls.some(([kind]) => kind === 'copy'),
    false,
  );
  h.close();
});

test('当前生成稿可采纳标题和正文，更新预览并通知列表，不能重复采纳', async () => {
  const h = harness();
  h.state.response.latestTask.generatedTitle = 'AI 推荐标题';
  h.visible.value = true;
  await flush();
  assert.equal(h.adoptTitle.value, true);
  assert.equal(h.canAdopt.value, true);
  assert.match(h.adoptConfirmation.value, /标题与正文/);
  assert.equal(
    h.calls.some(([kind]) => kind === 'adopt'),
    false,
  );
  await h.adopt();
  assert.deepEqual(
    h.calls.find(([kind]) => kind === 'adopt'),
    ['adopt', 20, 2, true],
  );
  assert.equal(h.preview.value.article.title, 'AI 推荐标题');
  assert.equal(h.preview.value.article.content, '最新生成稿');
  assert.equal(h.preview.value.article.version, 3);
  assert.equal(h.preview.value.latestTask.status, 'adopted');
  assert.equal(
    h.calls.filter(([kind, event]) => kind === 'emit' && event === 'adopted')
      .length,
    1,
  );
  assert.equal(h.canAdopt.value, false);
  await h.adopt();
  assert.equal(h.calls.filter(([kind]) => kind === 'adopt').length, 1);
  h.close();
});

test('可取消标题采纳，旧记录自动只采纳正文，不把原标题当 AI 推荐', async () => {
  for (const hasTitle of [true, false]) {
    const h = harness();
    if (hasTitle) h.state.response.latestTask.generatedTitle = '新标题';
    h.visible.value = true;
    await flush();
    h.adoptTitle.value = false;
    await h.load(true);
    assert.equal(h.adoptTitle.value, false);
    assert.doesNotMatch(h.adoptConfirmation.value, /标题与正文/);
    await h.adopt();
    assert.deepEqual(
      h.calls.find(([kind]) => kind === 'adopt'),
      ['adopt', 20, 2, false],
    );
    assert.equal(h.preview.value.article.title, '标题');
    h.close();
  }
});

test('无写权限、版本不一致、非成功或没有正文时不允许采纳', async () => {
  for (const scenario of [
    'permission',
    'version',
    'empty',
    'failed',
    'needs_input',
    'pending',
    'running',
    'interrupted',
    'adopted',
  ]) {
    const h = harness();
    if (scenario === 'permission') h.state.updatePermission = false;
    else if (scenario === 'version') h.state.response.article.version = 3;
    else if (scenario === 'empty') h.state.response.latestTask.result = '';
    else h.state.response.latestTask.status = scenario;
    h.visible.value = true;
    await flush();
    assert.equal(h.canAdopt.value, false, scenario);
    await h.adopt();
    assert.equal(
      h.calls.some(([kind]) => kind === 'adopt'),
      false,
      scenario,
    );
    h.close();
  }
});

test('采纳请求期间阻止重复操作、关闭、路由离开和刷新；失败保留候选', async () => {
  const h = harness();
  let reject;
  h.state.adopted = new Promise((_, fail) => {
    reject = fail;
  });
  h.visible.value = true;
  await flush();
  const pending = h.adopt();
  assert.equal(h.adopting.value, true);
  await h.adopt();
  h.requestClose();
  let closed = false;
  h.beforeClose(() => {
    closed = true;
  });
  assert.equal(h.visible.value, true);
  assert.equal(closed, false);
  assert.equal(
    h.guards.every((guard) => !guard()),
    true,
  );
  const event = {
    preventDefault() {
      this.prevented = true;
    },
    returnValue: null,
  };
  h.listeners.get('beforeunload')(event);
  assert.equal(event.prevented, true);
  assert.equal(event.returnValue, '');
  reject(Error('conflict'));
  await pending;
  assert.equal(h.adopting.value, false);
  assert.equal(h.preview.value.latestTask.status, 'succeeded');
  assert.equal(h.preview.value.article.content, '已保存的旧正文');
  assert.equal(h.content.value, '最新生成稿');
  assert.equal(h.calls.filter(([kind]) => kind === 'adopt').length, 1);
  assert.equal(
    h.calls.some(([kind]) => kind === 'emit'),
    false,
  );
  await h.copyContent();
  assert.deepEqual(h.calls.at(-1), ['copy', '最新生成稿']);
  h.beforeClose(() => {
    closed = true;
  });
  assert.equal(closed, true);
  h.close();
  assert.equal(h.listeners.size, 0);
});

test('采纳响应迟到时不回填另一篇文章或卸载后的界面', async () => {
  for (const unmount of [false, true]) {
    const h = harness();
    let resolve;
    h.state.adopted = new Promise((done) => {
      resolve = done;
    });
    h.visible.value = true;
    await flush();
    const pending = h.adopt();
    if (unmount) h.close();
    else {
      h.state.response = { article: { id: 4, version: 1 }, latestTask: null };
      h.props.row = { id: 4 };
      await flush();
    }
    resolve({ id: 3, title: '迟到标题', content: '迟到正文', version: 3 });
    await pending;
    assert.equal(
      h.calls.some(([kind]) => kind === 'emit'),
      false,
    );
    if (!unmount) {
      assert.equal(h.preview.value.article.id, 4);
      h.close();
    }
  }
});
