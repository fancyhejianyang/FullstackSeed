import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as vue from 'vue';
import { parse, compileTemplate } from '@vue/compiler-sfc';
import ts from 'typescript';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const apiSource = await read('../../api/hotTopic.ts');
const apiCode = ts.transpileModule(
  apiSource.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, ''),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const api = new Function(
  'request',
  `${apiCode}; return {safeSourceUrl, activeRun};`,
)({});
const preferenceCode = ts.transpileModule(
  (await read('./preferenceValidation.ts'))
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, ''),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const validateSchedule = new Function(
  `${preferenceCode}; return scheduleValidationError;`,
)();
const files = [
  'Index.vue',
  'Preferences.vue',
  'View.vue',
  'Runs.vue',
  'CreateArticle.vue',
  '../hot-topic-source/Index.vue',
  '../hot-topic-source/Edit.vue',
  '../hot-topic-source/View.vue',
];
const sources = new Map(
  await Promise.all(files.map(async (name) => [name, await read(`./${name}`)])),
);

test('来源外链仅允许无凭据 HTTPS，禁止脚本和非安全协议', () => {
  assert.equal(
    api.safeSourceUrl('https://www.douyin.com/user/123'),
    'https://www.douyin.com/user/123',
  );
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,test',
    'http://example.com',
    'https://name:password@example.com',
    'invalid',
  ])
    assert.equal(api.safeSourceUrl(value), '');
});

test('只有待执行和执行中的状态持续轮询', () => {
  assert.equal(api.activeRun('pending'), true);
  assert.equal(api.activeRun('running'), true);
  for (const status of [
    'succeeded',
    'partial',
    'failed',
    'interrupted',
    'unknown',
  ])
    assert.equal(api.activeRun(status), false);
});

test('所有新页面模板可编译，来源与模型内容只以转义文本渲染', () => {
  for (const [name, source] of sources) {
    const { descriptor, errors } = parse(source);
    assert.deepEqual(errors, [], name);
    const result = compileTemplate({
      source: descriptor.template.content,
      filename: name,
      id: name,
      compilerOptions: { expressionPlugins: ['typescript'] },
    });
    assert.deepEqual(result.errors, [], name);
    assert.doesNotMatch(source, /v-html|innerHTML|eval\(/, name);
  }
});

test('手动发起、计划默认关闭、创建后是否生成须明确选择', () => {
  assert.match(sources.get('Preferences.vue'), /scheduleEnabled: false/);
  assert.match(sources.get('Preferences.vue'), /ElMessageBox\.confirm/);
  assert.match(sources.get('CreateArticle.vue'), /generate: false/);
  assert.match(sources.get('Index.vue'), /@click="run\('discover'\)"/);
  assert.match(sources.get('Index.vue'), /perm="HotTopic.create"/);
  assert.doesNotMatch(sources.get('Index.vue'), /onMounted\(/);
});

test('指定账号预设不冒充已核验，密钥不从详情写回表单', () => {
  const source = sources.get('../hot-topic-source/Edit.vue');
  assert.match(source, /央视新闻.*央视网.*钧正平/);
  assert.match(source, /不是身份校验/);
  assert.match(source, /稳定账号 ID/);
  assert.doesNotMatch(
    source,
    /apiToken:\s*row\.apiToken|Object\.assign\(form,\s*row\)/,
  );
  assert.match(source, /delete data\.apiToken/);
  assert.match(source, /清除密钥/);
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await vue.nextTick();
}

function runsHarness(getHotRun) {
  const visible = vue.ref(false),
    timers = new Map();
  let timerId = 0;
  const scope = vue.effectScope();
  const raw = parse(
    sources.get('Runs.vue'),
  ).descriptor.scriptSetup.content.replace(/^import[\s\S]*?;\r?\n/gm, '');
  const script = ts.transpileModule(raw, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    ref: vue.ref,
    watch: vue.watch,
    onBeforeUnmount: () => {},
    defineModel: () => visible,
    defineProps: () => ({ runId: null }),
    defineEmits: () => () => {},
    getHotRun,
    getHotRuns: async () => ({ list: [], total: 0 }),
    activeRun: api.activeRun,
    setTimeout: (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const state = scope.run(() =>
    new Function(
      ...Object.keys(context),
      `${script}; return {loadDetail, detail, detailFailed, stop};`,
    )(...Object.values(context)),
  );
  return {
    ...state,
    visible,
    timers,
    dispose: () => {
      state.stop();
      scope.stop();
    },
  };
}

test('关闭记录窗口后迟到响应不能恢复详情或启动轮询', async () => {
  const request = deferred();
  const h = runsHarness(() => request.promise);
  h.visible.value = true;
  await flush();
  const loading = h.loadDetail(4);
  h.visible.value = false;
  await flush();
  request.resolve({ id: 4, status: 'running' });
  await loading;
  assert.equal(h.detail.value, null);
  assert.equal(h.timers.size, 0);
  h.dispose();
});

test('切换任务时旧响应不能覆盖新任务，终态不创建轮询计时器', async () => {
  const oldRequest = deferred();
  const h = runsHarness((id) =>
    id === 1
      ? oldRequest.promise
      : Promise.resolve({ id: 2, status: 'succeeded' }),
  );
  h.visible.value = true;
  await flush();
  const old = h.loadDetail(1);
  await h.loadDetail(2);
  oldRequest.resolve({ id: 1, status: 'running' });
  await old;
  assert.equal(h.detail.value.id, 2);
  assert.equal(h.timers.size, 0);
  h.dispose();
});

test('任务读取失败清空旧详情，不自动重试收费执行接口', async () => {
  let failed = false;
  const h = runsHarness(async () => {
    if (failed) throw Error('network');
    return { id: 1, status: 'running' };
  });
  h.visible.value = true;
  await flush();
  await h.loadDetail(1);
  assert.equal(h.timers.size, 1);
  failed = true;
  await h.loadDetail(1);
  assert.equal(h.detail.value, null);
  assert.equal(h.detailFailed.value, true);
  assert.equal(h.timers.size, 0);
  h.dispose();
});

test('模型或来源失效时仍允许关闭每日计划，未填模型可保存偏好设置', () => {
  const preference = {
    mode: 'aiSearch',
    aiConfigId: 9,
    sourceIds: [4],
    scheduleEnabled: false,
  };
  assert.equal(
    validateSchedule(preference, { aiConfigs: [], sources: [] }, false),
    null,
  );
  assert.equal(
    validateSchedule(
      { ...preference, aiConfigId: null, sourceIds: [] },
      { aiConfigs: [], sources: [] },
      true,
    ),
    null,
  );
});

test('每日计划启用前校验执行权限、可用来源与真正联网协议', () => {
  const preference = {
    mode: 'aiSearch',
    aiConfigId: 9,
    sourceIds: [],
    scheduleEnabled: true,
  };
  const choices = {
    aiConfigs: [{ id: 9, webSearchMode: 'disabled' }],
    sources: [],
  };
  assert.match(
    validateSchedule(preference, choices, false),
    /缺少热点执行权限/,
  );
  assert.match(validateSchedule(preference, choices, true), /联网协议/);
  assert.equal(
    validateSchedule(
      preference,
      { ...choices, aiConfigs: [{ id: 9, webSearchMode: 'bailianResponses' }] },
      true,
    ),
    null,
  );
  assert.match(
    validateSchedule({ ...preference, mode: 'platform' }, choices, true),
    /至少选择一个来源/,
  );
  assert.match(
    validateSchedule(
      { ...preference, mode: 'platform', sourceIds: [4] },
      { ...choices, sources: [{ id: 4, accessMode: 'search' }] },
      true,
    ),
    /请切换/,
  );
});

test('创建并生成权限与模型选项读取权限一致，成功文案依据实际任务回执', () => {
  const source = sources.get('CreateArticle.vue');
  assert.match(source, /HotTopic\.create/);
  assert.match(source, /ContentArticle\.create/);
  assert.match(source, /ContentArticle\.update/);
  assert.match(source, /ContentTemplate\.read/);
  assert.match(source, /v-if="visible && form\.generate && canGenerate"/);
  assert.match(source, /result\.taskId/);
});
