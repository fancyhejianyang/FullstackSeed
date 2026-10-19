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
      '\nexport { hasCover, load, preview, content, copyContent, generatedTitle, adopt, canAdopt, adopting, adoptConfirmation, canLeave, beforeClose, requestClose, beforeUnload, originalIdea };',
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
              ['pending', 'running'].includes(task?.status) ||
              ['pending', 'running'].includes(task?.coverStatus),
          };
        if (name === '@/api/contentArticle')
          return {
            getContentArticlePreview: async (id) => {
              calls.push(['read', id]);
              return structuredClone(await state.response);
            },
            adoptContentTask: async (id, version, adoptTitle, adoptCover) => {
              calls.push(['adopt', id, version, adoptTitle, adoptCover]);
              if (state.adoptError) throw Error('conflict');
              return state.adopted
                ? await state.adopted
                : {
                    ...state.response.article,
                    title: adoptTitle
                      ? state.response.latestTask.generatedTitle
                      : state.response.article.title,
                    coverUrl: adoptCover
                      ? state.response.latestTask.coverData.url
                      : state.response.article.coverUrl,
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
test('文章列表和查看弹窗保留精简布局，初始想法独立于正文展示', async () => {
  assert.doesNotMatch(
    source,
    /<Tasks|v-html|<el-tabs|<el-tab-pane|records|刷新|detail\.(coverUrl|content|title)/,
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
  assert.match(source, /<details class="article-view__notes" open>/);
  assert.match(source, /<summary>初始想法<\/summary>/);
});

test('查看优先显示生成时初始想法，复制正文不混入素材', async () => {
  const h = harness();
  h.state.response.article.idea = '后来修改的想法';
  h.state.response.latestTask.snapshot = {
    idea: '生成时提交的初始想法\n第二行',
  };
  h.visible.value = true;
  await flush();
  assert.equal(h.originalIdea.value, '生成时提交的初始想法\n第二行');
  await h.copyContent();
  assert.deepEqual(h.calls.at(-1), ['copy', '最新生成稿']);
  h.state.response.latestTask.snapshot.idea = '';
  await h.load();
  assert.equal(h.originalIdea.value, '');
  h.close();
});

test('没有任务或历史缺少想法快照时展示文章想法；任务失败也可阅读初始素材', async () => {
  const h = harness();
  h.state.response.article.idea = '记录的想法';
  h.visible.value = true;
  await flush();
  assert.equal(h.originalIdea.value, '记录的想法');
  h.state.response.latestTask = null;
  await h.load();
  assert.equal(h.originalIdea.value, '记录的想法');
  h.state.response.latestTask = {
    id: 21,
    status: 'failed',
    snapshot: { idea: '失败任务的原始素材' },
  };
  await h.load();
  assert.equal(h.originalIdea.value, '失败任务的原始素材');
  assert.equal(h.content.value, '');
  h.close();
});

test('最新稿展示 AI 推荐标题，只复制正文且不混入标题或提示', async () => {
  const h = harness();
  h.state.response.latestTask.generatedTitle = 'AI 发布标题';
  h.visible.value = true;
  await flush();
  assert.equal(h.generatedTitle.value, 'AI 发布标题');
  await h.copyContent();
  assert.deepEqual(
    h.calls.filter(([kind]) => kind === 'copy'),
    [['copy', '最新生成稿']],
  );
  h.close();
});

test('旧记录与最新失败结果不把原标题或错误字段当生成标题', async () => {
  const h = harness();
  h.visible.value = true;
  await flush();
  assert.equal(h.generatedTitle.value, '');
  h.state.response.latestTask = {
    id: 21,
    status: 'failed',
    generatedTitle: '不可用标题',
    result: '不可用正文',
  };
  await h.load();
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
  assert.equal(h.canAdopt.value, true);
  assert.match(h.adoptConfirmation.value, /标题与正文/);
  assert.equal(
    h.calls.some(([kind]) => kind === 'adopt'),
    false,
  );
  await h.adopt();
  assert.deepEqual(
    h.calls.find(([kind]) => kind === 'adopt'),
    ['adopt', 20, 2, true, false],
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

test('旧记录缺少或只有空白标题时只采纳正文，保留原标题', async () => {
  for (const title of [undefined, null, '', '  \n ']) {
    const h = harness();
    h.state.response.latestTask.generatedTitle = title;
    h.visible.value = true;
    await flush();
    await h.load(true);
    assert.equal(h.generatedTitle.value, '');
    assert.doesNotMatch(h.adoptConfirmation.value, /标题与正文/);
    await h.adopt();
    assert.deepEqual(
      h.calls.find(([kind]) => kind === 'adopt'),
      ['adopt', 20, 2, false, false],
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

test('封面生成中保持正文可读与轮询，终态才允许采纳，失败不影响正文', async () => {
  const h = harness();
  h.state.response.latestTask.coverStatus = 'running';
  h.visible.value = true;
  await flush();
  assert.equal(h.content.value, '最新生成稿');
  assert.equal(h.canAdopt.value, false);
  assert.equal(h.timers.size, 1);
  await h.adopt();
  assert.equal(
    h.calls.some(([kind]) => kind === 'adopt'),
    false,
  );
  h.state.response.latestTask.coverStatus = 'failed';
  await h.load(true);
  assert.equal(h.canAdopt.value, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.content.value, '最新生成稿');
  h.close();
});

test('一次采纳同时保存生成标题、正文与成功封面，并通知列表更新', async () => {
  const h = harness();
  h.state.response.article.coverUrl = '/uploads/old.png';
  h.state.response.latestTask.generatedTitle = 'AI 推荐标题';
  h.state.response.latestTask.coverStatus = 'succeeded';
  h.state.response.latestTask.coverData = { url: '/uploads/candidate.png' };
  h.visible.value = true;
  await flush();
  assert.equal(h.hasCover.value, true);
  await h.load(true);
  assert.match(h.adoptConfirmation.value, /标题、正文及封面/);
  await h.adopt();
  assert.deepEqual(
    h.calls.find(([kind]) => kind === 'adopt'),
    ['adopt', 20, 2, true, true],
  );
  assert.equal(h.preview.value.article.title, 'AI 推荐标题');
  assert.equal(h.preview.value.article.content, '最新生成稿');
  assert.equal(h.preview.value.article.coverUrl, '/uploads/candidate.png');
  assert.equal(h.calls.filter(([kind]) => kind === 'adopt').length, 1);
  assert.equal(
    h.calls.find(([kind, event]) => kind === 'emit' && event === 'adopted')[2]
      .coverUrl,
    '/uploads/candidate.png',
  );
  h.close();
});

test('采纳只包含可用的标题和封面，失败或缺失封面保留原图', async () => {
  for (const [coverStatus, url, expectedCover] of [
    [undefined, undefined, false],
    ['skipped', undefined, false],
    ['failed', '/uploads/stale.png', false],
    ['interrupted', '/uploads/stale.png', false],
    ['succeeded', undefined, false],
    ['succeeded', '  ', false],
    ['succeeded', '/uploads/new.png', true],
  ]) {
    const h = harness();
    h.state.response.article.coverUrl = '/uploads/old.png';
    h.state.response.latestTask.coverStatus = coverStatus;
    h.state.response.latestTask.coverData = url === undefined ? null : { url };
    h.visible.value = true;
    await flush();
    assert.equal(h.hasCover.value, expectedCover);
    assert.equal(h.adoptConfirmation.value.includes('封面'), expectedCover);
    assert.doesNotMatch(h.adoptConfirmation.value, /标题/);
    await h.adopt();
    assert.deepEqual(
      h.calls.find(([kind]) => kind === 'adopt'),
      ['adopt', 20, 2, false, expectedCover],
    );
    assert.equal(h.preview.value.article.title, '标题');
    assert.equal(
      h.preview.value.article.coverUrl,
      expectedCover ? url : '/uploads/old.png',
    );
    h.close();
  }
});

test('查看页只保留统一采纳、复制正文和关闭，不再分散选择或复制标题', () => {
  const template = parse(source).descriptor.template.content;
  assert.doesNotMatch(
    source,
    /Checkbox|copyTitle|v-model="adopt(?:Title|Cover)"/,
  );
  assert.equal((template.match(/@click="adopt"/g) || []).length, 1);
  const footer = template.slice(template.indexOf('<template #footer>'));
  assert.deepEqual(
    [...footer.matchAll(/@click="([^"]+)"/g)].map((match) => match[1]),
    ['copyContent', 'adopt', 'requestClose'],
  );
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
