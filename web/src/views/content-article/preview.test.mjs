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
    unmount = [];
  const state = {
    response: {
      article: { id: 3, title: '标题', content: '已保存的旧正文' },
      latestTask: { id: 20, status: 'succeeded', result: '最新生成稿' },
    },
  };
  const exports = {},
    scope = vue.effectScope();
  const code = ts.transpileModule(
    parse(source).descriptor.scriptSetup.content +
      '\nexport { load, preview, pane, content, copyContent, generatedTitle, displayedTitle, copyTitle };',
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
      code,
    )(
      (name) => {
        if (name === 'vue')
          return { ...vue, onBeforeUnmount: (cb) => unmount.push(cb) };
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
              return await state.response;
            },
          };
        return {};
      },
      exports,
      () => props,
      () => () => {},
      () => visible,
      (cb) => {
        const id = timers.size + 1;
        timers.set(id, cb);
        return id;
      },
      (id) => timers.delete(id),
      { clipboard: { writeText: async (text) => calls.push(['copy', text]) } },
    ),
  );
  return {
    ...exports,
    props,
    visible,
    calls,
    state,
    timers,
    close() {
      unmount.forEach((fn) => fn());
      scope.stop();
    },
  };
}

test('文章每次打开查询最新结果，默认复制最新稿，保存正文需明确切换', async () => {
  const h = harness();
  h.visible.value = true;
  await flush();
  assert.equal(h.pane.value, 'latest');
  assert.equal(h.content.value, '最新生成稿');
  await h.copyContent();
  assert.deepEqual(h.calls.at(-1), ['copy', '最新生成稿']);
  h.pane.value = 'saved';
  assert.equal(h.content.value, '已保存的旧正文');
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
  assert.equal(h.pane.value, 'latest');
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
    await h.load(true);
    await h.copyContent();
    assert.equal(h.pane.value, 'latest');
    assert.equal(h.content.value, '');
  }
  assert.equal(
    h.calls.some(([kind]) => kind === 'copy'),
    false,
  );
  h.close();
  assert.equal(h.timers.size, 0);
});
test('没有任务显示已保存正文；失败清空旧内容，可手动重新加载', async () => {
  const h = harness();
  h.state.response.latestTask = null;
  h.visible.value = true;
  await flush();
  assert.equal(h.pane.value, 'saved');
  h.state.response = Promise.reject(Error('network'));
  await h.load();
  assert.equal(h.preview.value, null);
  assert.equal(h.content.value, '');
  h.state.response = {
    article: { id: 3, content: '修订内容' },
    latestTask: null,
  };
  await h.load();
  assert.equal(h.content.value, '修订内容');
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
test('文章弹窗不再嵌入历史表格，独立模块复用表格/权限并提供记录入口', async () => {
  assert.doesNotMatch(source, /<Tasks|v-html/);
  assert.doesNotMatch(await read('./Edit.vue'), /<Tasks/);
  assert.match(
    await read('../content-generation/Index.vue'),
    /<PageContainer title="生成记录"/,
  );
  assert.match(await read('./Tasks.vue'), /:search-fields="searchFields"/);
  const index = await read('./Index.vue');
  assert.match(index, /openRecords\(row.id\)/);
  assert.match(index, /@records="openRecords"/);
});

test('最新稿展示 AI 标题，已保存页展示原标题；复制标题不混入正文或提示', async () => {
  const h = harness();
  h.state.response.latestTask.generatedTitle = 'AI 发布标题';
  h.visible.value = true;
  await flush();
  assert.equal(h.displayedTitle.value, 'AI 发布标题');
  await h.copyTitle();
  await h.copyContent();
  assert.deepEqual(
    h.calls.filter(([kind]) => kind === 'copy'),
    [
      ['copy', 'AI 发布标题'],
      ['copy', '最新生成稿'],
    ],
  );
  h.pane.value = 'saved';
  assert.equal(h.displayedTitle.value, '标题');
  await h.copyTitle();
  assert.equal(h.calls.filter(([kind]) => kind === 'copy').length, 2);
  h.close();
});

test('旧记录与最新失败结果不把原标题或错误字段当生成标题', async () => {
  const h = harness();
  h.visible.value = true;
  await flush();
  assert.equal(h.generatedTitle.value, '');
  assert.equal(h.displayedTitle.value, '标题');
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
