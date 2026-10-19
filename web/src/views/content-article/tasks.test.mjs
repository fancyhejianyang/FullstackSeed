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
    version: 2,
    canAdopt: true,
    revision: 0,
  });
  const calls = [],
    timers = new Map(),
    unmount = [];
  const state = {
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
      compile(
        parse(source).descriptor.scriptSetup.content +
          '\nexport { fetchTasks, showDetail, adopt, detail, tableRef, pollFailed };',
      ),
    )(
      (name) => {
        if (name === 'vue')
          return { ...vue, onBeforeUnmount: (cb) => unmount.push(cb) };
        if (name === 'element-plus')
          return { ElMessage: { success() {}, warning() {} } };
        if (name === '@/api/contentArticle')
          return {
            getContentTasks: async (...args) => {
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
test('未保存修改或版本不一致不能直接采用，合法采用立即同步文章版本', async () => {
  const h = harness();
  await h.showDetail({ id: 20 });
  h.props.canAdopt = false;
  await h.adopt();
  h.props.canAdopt = true;
  h.props.version = 3;
  await h.adopt();
  assert.equal(
    h.calls.some((call) => call[0] === 'adopt'),
    false,
  );
  h.props.version = 2;
  await h.adopt();
  assert.deepEqual(
    h.calls.find((call) => call[0] === 'adopt'),
    ['adopt', 20, 2],
  );
  assert.equal(h.detail.value.status, 'adopted');
  assert.equal(
    h.calls.find((call) => call[0] === 'emit' && call[1] === 'adopted')[2]
      .version,
    3,
  );
  assert.match(source, /confirm-text="采用后将替换文章正文并立即保存/);
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
