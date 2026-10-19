import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as vue from 'vue';
import { parse } from '@vue/compiler-sfc';
import ts from 'typescript';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const source = await read('./Tasks.vue');
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const stateExports = {};
new Function('require', 'exports', compile(await read('./taskState.ts')))(
  () => ({ getPermissionActionColor: (action) => action }),
  stateExports,
);
function harness() {
  const props = vue.reactive({
    articleId: 3,
  });
  const calls = [],
    timers = new Map(),
    unmount = [];
  const state = {
    article: { id: 3, version: 2 },
    canAdopt: true,
    list: {
      list: [
        {
          id: 20,
          articleId: 3,
          articleVersion: 2,
          status: 'running',
          createdAt: '2026-10-19T00:00:00Z',
          startedAt: null,
          finishedAt: null,
        },
      ],
      total: 1,
    },
    detail: {
      id: 20,
      articleId: 3,
      articleVersion: 2,
      status: 'succeeded',
      result: '候选正文',
      snapshot: {
        title: '标题',
        idea: '想法',
        template: { name: '模板' },
        config: { name: '创作', model: 'text' },
      },
    },
    adoption: {
      id: 3,
      version: 3,
      title: '标题',
      idea: '想法',
      content: '候选正文',
      coverUrl: '',
    },
  };
  const exports = {};
  const scope = vue.effectScope();
  scope.run(() =>
    new Function(
      'require',
      'exports',
      'defineProps',
      'defineEmits',
      'setTimeout',
      'clearTimeout',
      'navigator',
      'window',
      compile(
        parse(source).descriptor.scriptSetup.content +
          '\nexport { fetchTasks, showDetail, adopt, detail, tableRef, pollFailed, hasCandidate, copyResult, closeDetail, detailVisible, adoptTitle, adoptConfirmation, hasGeneratedTitle, copyTitle };',
      ),
    )(
      (name) => {
        if (name === 'vue')
          return {
            ...vue,
            onMounted() {},
            onBeforeUnmount: (cb) => unmount.push(cb),
          };
        if (name === 'element-plus')
          return { ElMessage: { success() {}, warning() {} } };
        if (name === 'vue-router')
          return { onBeforeRouteLeave() {}, onBeforeRouteUpdate() {} };
        if (name === '@/stores/user')
          return {
            useUserStore: () => ({ hasPermission: () => state.canAdopt }),
          };
        if (name === '@/api/contentArticle')
          return {
            getContentArticle: async () => ({ ...state.article }),
            getContentGenerationRecords: async (...args) => {
              calls.push(['list', ...args]);
              return await state.list;
            },
            getContentTask: async (id) => {
              calls.push(['detail', id]);
              return await state.detail;
            },
            adoptContentTask: async (...args) => {
              calls.push(['adopt', ...args]);
              return await state.adoption;
            },
          };
        if (name === './taskState') return stateExports;
        return {};
      },
      exports,
      () => props,
      () =>
        (...args) =>
          calls.push(['emit', ...args]),
      (cb) => {
        const id = timers.size + 1;
        timers.set(id, cb);
        return id;
      },
      (id) => timers.delete(id),
      {
        clipboard: { writeText: async (value) => calls.push(['copy', value]) },
      },
      { addEventListener() {}, removeEventListener() {} },
    ),
  );
  exports.tableRef.value = {
    refresh: async () => {
      calls.push(['refresh']);
    },
  };
  return {
    ...exports,
    state,
    props,
    calls,
    timers,
    close() {
      unmount.forEach((fn) => fn());
      scope.stop();
    },
  };
}
test('只对活跃任务轮询，完成或卸载后停止', async () => {
  const h = harness();
  await h.fetchTasks({ page: 1 });
  assert.equal(h.timers.size, 1);
  assert.ok(
    h.calls.some(
      (call) => call[0] === 'emit' && call[1] === 'active' && call[2],
    ),
  );
  h.state.list.list[0].status = 'succeeded';
  await h.fetchTasks({ page: 1 });
  assert.equal(h.timers.size, 0);
  h.state.list.list[0].status = 'pending';
  await h.fetchTasks({});
  h.close();
  assert.equal(h.timers.size, 0);
});
test('迟到列表不得在卸载后继续轮询，失败显示手动刷新入口', async () => {
  const h = harness();
  let resolve;
  h.state.list = new Promise((done) => {
    resolve = done;
  });
  const pending = h.fetchTasks({});
  h.close();
  resolve({ list: [{ status: 'running' }], total: 1 });
  await pending;
  assert.equal(h.timers.size, 0);
  const failed = harness();
  failed.state.list = Promise.reject(Error('network'));
  await assert.rejects(failed.fetchTasks({}));
  assert.equal(failed.pollFailed.value, true);
  assert.equal(failed.timers.size, 0);
  failed.close();
});
test('无写权限或版本不一致不能采用，详情读取当前版本，合法采用同步版本', async () => {
  const h = harness();
  await h.showDetail({ id: 20 });
  h.state.canAdopt = false;
  await h.adopt();
  h.state.canAdopt = true;
  h.state.article.version = 3;
  await h.showDetail({ id: 20 });
  await h.adopt();
  assert.equal(
    h.calls.some((call) => call[0] === 'adopt'),
    false,
  );
  h.state.article.version = 2;
  await h.showDetail({ id: 20 });
  await h.adopt();
  assert.deepEqual(
    h.calls.find((call) => call[0] === 'adopt'),
    ['adopt', 20, 2, false],
  );
  assert.equal(h.detail.value.status, 'adopted');
  assert.equal(
    h.calls.find((call) => call[0] === 'emit' && call[1] === 'adopted')[2]
      .version,
    3,
  );
  assert.match(source, /:confirm-text="adoptConfirmation"/);
  h.close();
});
test('较早详情响应不覆盖当前任务', async () => {
  const h = harness();
  let resolve;
  h.state.detail = new Promise((done) => {
    resolve = done;
  });
  const first = h.showDetail({ id: 20 });
  h.state.detail = { id: 21, status: 'failed' };
  await h.showDetail({ id: 21 });
  resolve({ id: 20, status: 'succeeded', result: '迟到正文' });
  await first;
  assert.equal(h.detail.value.id, 21);
  h.close();
});
test('待补充素材终止轮询且不能复制或采用提示为正文', async () => {
  const h = harness();
  h.state.list.list[0].status = 'needs_input';
  h.state.detail = {
    ...h.state.detail,
    status: 'needs_input',
    result: '错误混入的内容',
    editorNotes: ['请补充新闻来源'],
  };
  await h.fetchTasks({});
  await h.showDetail({ id: 20 });
  assert.equal(h.timers.size, 0);
  assert.equal(h.hasCandidate.value, false);
  await h.adopt();
  await h.copyResult();
  assert.equal(
    h.calls.some((call) => ['adopt', 'copy'].includes(call[0])),
    false,
  );
  assert.equal(stateExports.taskLabel('needs_input'), '待补充素材');
  assert.equal(stateExports.isActiveTask({ status: 'needs_input' }), false);
  h.close();
});
test('复制与采用只使用正文，独立编辑提示不混入；历史候选仍可复制', async () => {
  const h = harness();
  h.state.detail.editorNotes = ['发布前核对日期'];
  await h.showDetail({ id: 20 });
  await h.copyResult();
  assert.deepEqual(
    h.calls.find((call) => call[0] === 'copy'),
    ['copy', '候选正文'],
  );
  await h.adopt();
  assert.equal(h.detail.value.status, 'adopted');
  delete h.state.detail.editorNotes;
  await h.showDetail({ id: 20 });
  await h.copyResult();
  assert.equal(h.calls.filter((call) => call[0] === 'copy').length, 2);
  assert.match(source, /aria-label="编辑提示"/);
  assert.doesNotMatch(source, /v-html/);
  h.close();
});
test('耗时使用真实时间边界，不生成百分比', () => {
  assert.equal(
    stateExports.taskElapsed({
      createdAt: '2026-10-19T00:00:00Z',
      startedAt: '2026-10-19T00:00:02Z',
      finishedAt: '2026-10-19T00:00:12Z',
    }),
    '10 秒',
  );
  assert.equal(stateExports.taskElapsed({ createdAt: 'invalid' }), '—');
  assert.equal(stateExports.isActiveTask({ status: 'adopted' }), false);
});

test('重复打开详情重新读取，失败清空旧稿，关闭后迟到响应不得恢复', async () => {
  const h = harness();
  await h.showDetail({ id: 20 });
  h.state.detail = { ...h.state.detail, result: '更新后的结果' };
  await h.showDetail({ id: 20 });
  assert.equal(h.detail.value.result, '更新后的结果');
  h.state.detail = Promise.reject(Error('network'));
  await h.showDetail({ id: 21 });
  assert.equal(h.detail.value, null);
  assert.equal(h.hasCandidate.value, false);
  let resolve;
  h.state.detail = new Promise((done) => {
    resolve = done;
  });
  const pending = h.showDetail({ id: 20 });
  h.closeDetail();
  resolve({ id: 20, articleId: 3, status: 'succeeded', result: '迟到' });
  await pending;
  assert.equal(h.detail.value, null);
  assert.equal(h.detailVisible.value, false);
  h.close();
});

test('记录请求包含文章/状态/标题，迟到旧列表不能覆盖新筛选结果', async () => {
  const h = harness();
  let resolve;
  h.state.list = new Promise((done) => {
    resolve = done;
  });
  const old = h.fetchTasks({ page: 1, keyword: '旧' });
  h.state.list = {
    list: [{ id: 21, status: 'succeeded', articleTitle: '新' }],
    total: 1,
  };
  await h.fetchTasks({ page: 1, status: 'succeeded', keyword: '新' });
  resolve({ list: [{ id: 20, status: 'running' }], total: 5 });
  assert.equal((await old).list[0].id, 21);
  assert.deepEqual(h.calls.filter((call) => call[0] === 'list')[1][1], {
    page: 1,
    status: 'succeeded',
    keyword: '新',
    articleId: 3,
  });
  assert.equal(h.timers.size, 0);
  h.close();
});

test('选中的活跃详情不在当前分页时仍会刷新，并且只保留一个轮询', async () => {
  const h = harness();
  h.state.detail.status = 'running';
  await h.showDetail({ id: 20 });
  h.state.list = { list: [], total: 0 };
  await h.fetchTasks({ page: 2 });
  assert.equal(h.timers.size, 1);
  assert.equal(h.calls.filter((call) => call[0] === 'detail').length, 2);
  h.state.detail.status = 'succeeded';
  await h.fetchTasks({ page: 2 });
  assert.equal(h.timers.size, 0);
  h.close();
});

test('生成标题与正文分开复制，采用默认携带标题，取消勾选可保留原标题', async () => {
  const h = harness();
  h.state.detail.generatedTitle = '发布标题';
  await h.showDetail({ id: 20 });
  assert.equal(h.hasGeneratedTitle.value, true);
  assert.equal(h.adoptTitle.value, true);
  assert.match(h.adoptConfirmation.value, /替换文章标题与正文/);
  await h.copyTitle();
  await h.copyResult();
  assert.deepEqual(
    h.calls.filter((call) => call[0] === 'copy'),
    [
      ['copy', '发布标题'],
      ['copy', '候选正文'],
    ],
  );
  h.adoptTitle.value = false;
  await h.showDetail({ id: 20 }, true);
  assert.equal(h.adoptTitle.value, false);
  assert.doesNotMatch(h.adoptConfirmation.value, /标题与正文/);
  await h.adopt();
  assert.deepEqual(
    h.calls.find((call) => call[0] === 'adopt'),
    ['adopt', 20, 2, false],
  );
  h.close();
  const withTitle = harness();
  withTitle.state.detail.generatedTitle = '发布标题';
  await withTitle.showDetail({ id: 20 });
  await withTitle.adopt();
  assert.deepEqual(
    withTitle.calls.find((call) => call[0] === 'adopt'),
    ['adopt', 20, 2, true],
  );
  withTitle.close();
});

test('旧记录不伪造生成标题；失败及待补充记录不复制标题或采用', async () => {
  const h = harness();
  await h.showDetail({ id: 20 });
  assert.equal(h.hasGeneratedTitle.value, false);
  assert.equal(h.adoptTitle.value, false);
  await h.copyTitle();
  for (const status of ['failed', 'needs_input', 'pending']) {
    h.state.detail = { ...h.state.detail, status, generatedTitle: '不应使用' };
    await h.showDetail({ id: 20 });
    await h.copyTitle();
    await h.adopt();
    assert.equal(h.hasGeneratedTitle.value, false);
  }
  assert.equal(
    h.calls.some((call) => ['copy', 'adopt'].includes(call[0])),
    false,
  );
  h.close();
});
