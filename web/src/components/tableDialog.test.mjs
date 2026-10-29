import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import * as vue from 'vue';

// 使用真实组件脚本与可控请求/确认框；不代表浏览器交互或视觉验收。
async function loadSetup(file, names) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const script = parse(source).descriptor.scriptSetup.content;
  const output = ts.transpileModule(`${script}\nexport { ${names.join(', ')} };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function('require', 'exports', 'defineProps', 'withDefaults',
    'defineModel', 'defineEmits', 'defineExpose', output);
}

const tableSetup = await loadSetup('./Table.vue', [
  'fetchData', 'handleSearch', 'handleReset', 'handlePageChange', 'handlePageSizeChange',
  'handleDelete', 'runBatchDelete', 'handleSelectionChange', 'list', 'total', 'loading',
  'page', 'pageSize', 'searchModel', 'appliedSearchModel', 'deleting', 'batchDeleting',
]);
const dialogSetup = await loadSetup('./Dialog.vue', [
  'requestClose', 'handleBeforeClose', 'handleConfirm', 'closePending', 'closeLocked',
]);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(setup, options = {}) {
  const props = vue.reactive({ columns: [], request: async () => ({ list: [], total: 0 }), ...options });
  const model = vue.ref(true);
  const events = [];
  const messages = [];
  const unmountHooks = [];
  let confirm = async () => {};
  let permitted = true;
  const exports = {};
  const scope = vue.effectScope();
  scope.run(() => setup(
    (name) => {
      if (name === 'vue') return {
        ...vue, onMounted: () => {}, onBeforeUnmount: (fn) => unmountHooks.push(fn),
      };
      if (name === 'element-plus') return {
        ElMessageBox: { confirm: (...args) => confirm(...args) },
        ElMessage: Object.fromEntries(['success', 'warning', 'error'].map((kind) =>
          [kind, (message) => messages.push([kind, message])])),
      };
      if (name === '@/stores/user') return { useUserStore: () => ({ hasPermission: () => permitted }) };
      throw new Error(`Unexpected import: ${name}`);
    },
    exports,
    () => props,
    (_props, defaults) => {
      for (const [key, value] of Object.entries(defaults)) {
        if (props[key] === undefined) props[key] = typeof value === 'function' ? value() : value;
      }
      return props;
    },
    () => model,
    () => (...args) => events.push(args),
    () => {},
  ));
  return {
    props, model, events, messages, ...exports,
    setConfirm(fn) { confirm = fn; },
    setPermission(value) { permitted = value; },
    stop() { unmountHooks.splice(0).forEach((fn) => fn()); scope.stop(); },
  };
}

test('Table ignores old results and keeps the newest request loading', async (t) => {
  const first = deferred(), second = deferred();
  const requests = [first, second];
  const h = harness(tableSetup, { request: () => requests.shift().promise });
  t.after(h.stop);
  const old = h.fetchData();
  const latest = h.fetchData();
  first.resolve({ list: [{ id: 'old' }], total: 99 });
  await old;
  assert.deepEqual(h.list.value, []);
  assert.equal(h.total.value, 0);
  assert.equal(h.loading.value, true);
  second.resolve({ list: [{ id: 'latest' }], total: 1 });
  await latest;
  assert.deepEqual(h.list.value, [{ id: 'latest' }]);
  assert.equal(h.loading.value, false);
});

test('Table suppresses obsolete errors and does not write after unmount', async () => {
  const first = deferred(), second = deferred();
  const requests = [first, second];
  const h = harness(tableSetup, { request: () => requests.shift().promise });
  const old = h.fetchData();
  const latest = h.fetchData();
  first.reject(new Error('old failure'));
  await old;
  h.stop();
  second.resolve({ list: [{ id: 'late' }], total: 1 });
  await latest;
  assert.deepEqual(h.list.value, []);
  assert.equal(h.total.value, 0);
});

test('Table searches from page 1; refresh and page-size changes retain applied filters', async (t) => {
  const params = [];
  const h = harness(tableSetup, {
    request: async (value) => { params.push(value); return { list: [], total: 100 }; },
  });
  t.after(h.stop);
  h.page.value = 4;
  h.searchModel.keyword = 'committed';
  await h.handleSearch();
  assert.deepEqual(params.at(-1), { page: 1, pageSize: 10, keyword: 'committed' });
  await h.handlePageChange(3);
  h.searchModel.keyword = 'not yet searched';
  await h.fetchData();
  assert.deepEqual(params.at(-1), { page: 3, pageSize: 10, keyword: 'committed' });
  await h.handlePageSizeChange(20);
  assert.deepEqual(params.at(-1), { page: 1, pageSize: 20, keyword: 'committed' });
  const count = params.length;
  await h.handlePageChange(1);
  assert.equal(params.length, count);
  await h.handleReset();
  assert.deepEqual(params.at(-1), { page: 1, pageSize: 20 });
});

test('Table freezes selection before confirmation and blocks concurrent destructive actions', async (t) => {
  const confirmation = deferred();
  const payloads = [];
  let confirmCount = 0, singleDeletes = 0;
  const h = harness(tableSetup, {
    checkAble: true,
    batchDeleteRequest: async (payload) => payloads.push(payload),
    deleteRequest: async () => { singleDeletes += 1; },
  });
  t.after(h.stop);
  h.setConfirm(() => { confirmCount += 1; return confirmation.promise; });
  h.handleSelectionChange([{ id: 1 }, { id: 2 }]);
  const pending = h.runBatchDelete();
  assert.equal(h.batchDeleting.value, true);
  h.handleSelectionChange([{ id: 3 }]);
  await h.runBatchDelete();
  await h.handleDelete({ id: 4 });
  confirmation.resolve();
  await pending;
  assert.equal(confirmCount, 1);
  assert.equal(singleDeletes, 0);
  assert.deepEqual(payloads, [{ ids: [1, 2], rows: [{ id: 1 }, { id: 2 }] }]);
  assert.equal(h.batchDeleting.value, false);
});

test('Table distinguishes completed deletion from failed refresh', async (t) => {
  const h = harness(tableSetup, {
    deleteRequest: async () => {},
    request: async () => { throw new Error('list unavailable'); },
  });
  t.after(h.stop);
  await h.handleDelete({ id: 1 });
  assert.deepEqual(h.messages.map(([kind]) => kind), ['success', 'warning']);
  assert.match(h.messages[1][1], /删除已完成/);
  assert.deepEqual(h.events.filter(([event]) => event === 'delete'), [['delete', { id: 1 }]]);
});

test('Table confirmation cancellation and permission revocation never delete', async (t) => {
  let deletes = 0;
  const h = harness(tableSetup, { permModule: 'demo', deleteRequest: async () => { deletes += 1; } });
  t.after(h.stop);
  h.setConfirm(async () => { throw 'cancel'; });
  await h.handleDelete({ id: 1 });
  assert.equal(h.deleting.value, false);
  assert.deepEqual(h.messages, []);
  h.setConfirm(async () => h.setPermission(false));
  await h.handleDelete({ id: 1 });
  assert.equal(deletes, 0);
});

test('Dialog cancel and dismiss use the same guard; denied close leaves the model intact', async (t) => {
  const reasons = [];
  const h = harness(dialogSetup, { closeGuard: async (reason) => { reasons.push(reason); return false; } });
  t.after(h.stop);
  assert.equal(await h.requestClose(), false);
  assert.equal(await h.handleBeforeClose(), false);
  assert.deepEqual(reasons, ['cancel', 'dismiss']);
  assert.equal(h.model.value, true);
  assert.deepEqual(h.events, []);
  h.props.closeGuard = () => true;
  assert.equal(await h.requestClose(), true);
  assert.equal(h.model.value, false);
  assert.deepEqual(h.events, [['cancel']]);
});

test('Dialog blocks repeated async decisions, and old approval cannot close a reopened dialog', async (t) => {
  const decision = deferred();
  let calls = 0;
  const h = harness(dialogSetup, { closeGuard: () => { calls += 1; return decision.promise; } });
  t.after(h.stop);
  const pending = h.requestClose();
  assert.equal(h.closePending.value, true);
  assert.equal(await h.handleBeforeClose(), false);
  h.handleConfirm();
  assert.equal(calls, 1);
  assert.deepEqual(h.events, []);
  h.model.value = false;
  h.model.value = true;
  decision.resolve(true);
  assert.equal(await pending, false);
  assert.equal(h.model.value, true);
  assert.equal(h.closePending.value, false);
});

test('Dialog lockOnConfirm is opt-in and guards late approval when submitting starts', async (t) => {
  const unlocked = harness(dialogSetup, { confirmLoading: true });
  t.after(unlocked.stop);
  assert.equal(await unlocked.requestClose(), true);
  const decision = deferred();
  const locked = harness(dialogSetup, { lockOnConfirm: true, closeGuard: () => decision.promise });
  t.after(locked.stop);
  const pending = locked.requestClose();
  locked.props.confirmLoading = true;
  decision.resolve(true);
  assert.equal(await pending, false);
  assert.equal(await locked.requestClose(), false);
  assert.equal(locked.model.value, true);
});

test('Dialog preserves legacy done cancellation, async guards and stale callback protection', async (t) => {
  const h = harness(dialogSetup, { beforeClose: (done) => done(true) });
  t.after(h.stop);
  assert.equal(await h.requestClose(), false);
  let oldDone;
  h.props.beforeClose = (done) => { oldDone = done; };
  await h.requestClose();
  h.model.value = false;
  h.model.value = true;
  oldDone();
  assert.equal(h.model.value, true);
  const decision = deferred();
  h.props.beforeClose = async (done) => { await decision.promise; done(); done(); };
  const pending = h.handleBeforeClose();
  assert.equal(h.closePending.value, true);
  decision.resolve();
  assert.equal(await pending, true);
  assert.deepEqual(h.events, [['cancel']]);
});

test('Dialog guard rejection is reported without closing; unmount invalidates pending approval', async (t) => {
  const error = new Error('guard failed');
  const h = harness(dialogSetup, { closeGuard: async () => { throw error; } });
  t.after(h.stop);
  assert.equal(await h.requestClose(), false);
  assert.equal(h.model.value, true);
  assert.deepEqual(h.events, [['close-error', error]]);
  const decision = deferred();
  h.props.closeGuard = () => decision.promise;
  const pending = h.requestClose();
  h.stop();
  decision.resolve(true);
  assert.equal(await pending, false);
  assert.equal(h.model.value, true);
});
