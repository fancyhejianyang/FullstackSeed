import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as vue from 'vue';
import { parse, compileTemplate } from '@vue/compiler-sfc';
import ts from 'typescript';

const read = (name) => readFile(new URL(name, import.meta.url), 'utf8');
const responseSource = await read('./SearchResponse.vue');
const runsSource = await read('./Runs.vue');
const apiSource = await read('../../api/hotTopicDiagnostics.ts');
const compileScript = (source) =>
  ts.transpileModule(
    parse(source).descriptor.scriptSetup.content.replace(
      /^import[\s\S]*?;\r?\n/gm,
      '',
    ),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
const responseScript = compileScript(responseSource);

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { resolve, reject, promise };
}
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await vue.nextTick();
}
function responseHarness(t, getResponse) {
  const visible = vue.ref(false);
  const props = vue.reactive({
    runId: 1,
    sourceIndex: 0,
    sourceName: '来源一',
  });
  const requests = [];
  const scope = vue.effectScope();
  t.after(() => scope.stop());
  const context = {
    ref: vue.ref,
    watch: vue.watch,
    onBeforeUnmount: () => {},
    defineModel: () => visible,
    defineProps: () => props,
    getHotRunSearchResponse: (...args) => {
      requests.push(args);
      return getResponse(...args);
    },
  };
  const state = scope.run(() =>
    new Function(
      ...Object.keys(context),
      `${responseScript}; return {detail, loading, failed, load, clear};`,
    )(...Object.values(context)),
  );
  return { ...state, visible, props, requests };
}
const payload = (model) => ({
  version: 1,
  model,
  responseBody: '<script>alert("source")</script>',
  parsing: { status: 'failed', sourceCount: 0, code: 'search_unverified' },
});

test('查看只读取指定任务和来源的记录，来源下标零有效，关闭时不读取', async (t) => {
  const h = responseHarness(t, async () => payload('hy3'));
  assert.equal(h.requests.length, 0);
  h.visible.value = true;
  await flush();
  assert.deepEqual(h.requests, [[1, 0]]);
  assert.equal(h.detail.value.model, 'hy3');
  assert.equal(h.detail.value.responseBody, payload('hy3').responseBody);
  assert.equal(h.loading.value, false);
  h.visible.value = false;
  assert.equal(h.detail.value, null);
  assert.equal(h.requests.length, 1);
});

test('切换来源后迟到结果不能覆盖新来源的响应', async (t) => {
  const old = deferred();
  const h = responseHarness(t, (_id, index) =>
    index === 0 ? old.promise : Promise.resolve(payload('new-source')),
  );
  h.visible.value = true;
  h.props.sourceIndex = 1;
  await flush();
  assert.equal(h.detail.value.model, 'new-source');
  old.resolve(payload('old-source'));
  await flush();
  assert.equal(h.detail.value.model, 'new-source');
  assert.deepEqual(h.requests, [
    [1, 0],
    [1, 1],
  ]);
});

test('关闭或卸载后的迟到响应不能恢复正文或加载状态', async (t) => {
  for (const action of ['close', 'unmount']) {
    const request = deferred();
    const h = responseHarness(t, () => request.promise);
    h.visible.value = true;
    if (action === 'close') h.visible.value = false;
    else h.clear();
    request.resolve(payload(action));
    await flush();
    assert.equal(h.detail.value, null);
    assert.equal(h.loading.value, false);
    assert.equal(h.failed.value, false);
  }
});

test('切换任务后旧错误不能污染新任务，读取失败不自动重试', async (t) => {
  const old = deferred();
  const h = responseHarness(t, (id) =>
    id === 1 ? old.promise : Promise.resolve(payload('task-2')),
  );
  h.visible.value = true;
  h.props.runId = 2;
  await flush();
  old.reject(new Error('old response failed'));
  await flush();
  assert.equal(h.detail.value.model, 'task-2');
  assert.equal(h.failed.value, false);
  const failed = responseHarness(t, async () => {
    throw new Error('network');
  });
  failed.visible.value = true;
  await flush();
  assert.equal(failed.detail.value, null);
  assert.equal(failed.failed.value, true);
  assert.equal(failed.requests.length, 1);
  await failed.load();
  assert.equal(failed.requests.length, 2);
});

test('任务详情切换和关闭同时关闭联网响应窗口，未保存的来源不能打开', async (t) => {
  const visible = vue.ref(false);
  const scope = vue.effectScope();
  t.after(() => scope.stop());
  const context = {
    ref: vue.ref,
    watch: vue.watch,
    onBeforeUnmount: () => {},
    defineModel: () => visible,
    defineProps: () => ({ runId: null }),
    defineEmits: () => () => {},
    getHotRun: async (id) => ({
      id,
      status: 'partial',
      sources: [
        { sourceName: '联网来源', hasSearchResponse: true },
        { sourceName: '旧来源' },
      ],
    }),
    getHotRuns: async () => ({ list: [], total: 0 }),
    activeRun: () => false,
  };
  const state = scope.run(() =>
    new Function(
      ...Object.keys(context),
      `${compileScript(runsSource)}; return {loadDetail, showSearchResponse, responseVisible, responseSelection, stop};`,
    )(...Object.values(context)),
  );
  visible.value = true;
  await flush();
  await state.loadDetail(1);
  state.showSearchResponse(1);
  assert.equal(state.responseVisible.value, false);
  state.showSearchResponse(0);
  assert.equal(state.responseVisible.value, true);
  assert.deepEqual(state.responseSelection.value, {
    runId: 1,
    sourceIndex: 0,
    sourceName: '联网来源',
  });
  await state.loadDetail(2);
  assert.equal(state.responseVisible.value, false);
  assert.equal(state.responseSelection.value, null);
  state.showSearchResponse(0);
  state.stop();
  assert.equal(state.responseVisible.value, false);
});

test('诊断接口仅GET，模板安全转义原文且保留历史记录说明', () => {
  const requests = [];
  const script = ts.transpileModule(
    apiSource.replace(/^import[\s\S]*?;\r?\n/gm, ''),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const exported = {};
  new Function('request', 'exports', script)(
    { get: (...args) => requests.push(args) },
    exported,
  );
  exported.getHotRunSearchResponse(18, 0);
  assert.deepEqual(requests, [
    ['/hot-topics/runs/18/search-response/0', { silentError: true }],
  ]);
  for (const source of [responseSource, runsSource]) {
    const { descriptor, errors } = parse(source);
    assert.deepEqual(errors, []);
    assert.deepEqual(
      compileTemplate({
        source: descriptor.template.content,
        filename: 'diagnostics.vue',
        id: 'diagnostics',
        compilerOptions: { expressionPlugins: ['typescript'] },
      }).errors,
      [],
    );
    assert.doesNotMatch(source, /v-html|innerHTML|eval\(/);
  }
  assert.match(responseSource, /<pre class="response-body">\{\{/);
  assert.match(runsSource, /历史任务或未发起联网请求/);
  assert.doesNotMatch(responseSource, /setTimeout|setInterval|startHotRun/);
});

test('保留来源原始解析数量并与筛选后候选及整次请求来源数明确区分', () => {
  assert.match(
    runsSource,
    /\{\{ detail\.action === 'discover' \? '筛选后候选' : '候选' \}\}\s*\{\{ detail\.candidateCount \?\? 0 \}\} 条/,
  );
  assert.match(
    runsSource,
    /<p v-if="detail\.action === 'discover'" class="hint">/,
  );
  assert.match(runsSource, /解析 \{\{ source\.count \}\} 条（筛选前）/);
  assert.match(
    runsSource,
    /候选经过时间范围筛选、去重和数量上限限制，可能少于各来源解析条数之和/,
  );
  assert.match(responseSource, /label="请求解析来源"/);
  assert.match(responseSource, /\{\{ detail\.parsing\.sourceCount \}\} 条/);
  assert.match(responseSource, /本次请求解析到的全部可核验来源数量/);
  assert.match(responseSource, /任务记录显示各来源筛选前解析条数/);
  assert.match(
    responseSource,
    /最终候选经过时间范围筛选、去重和数量上限限制，可能少于解析数量/,
  );
  assert.doesNotMatch(responseSource, /各来源收录数量/);
});
