import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { File } from 'node:buffer';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import ts from 'typescript';
import * as vue from 'vue';

// Exercise real validators and reactive upload state. Network and Form injection are controlled;
// these cases do not replace a browser check of the file picker or image decoder.
async function compile(file) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  return new Function('require', 'exports', ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
const validators = {};
(await compile('./uploadValidation.ts'))(() => { throw new Error('Unexpected import'); }, validators);
const setup = await compile('./useSingleUpload.ts');
const file = (name = 'note.txt', text = 'hello', type = 'text/plain') => ({
  name, status: 'ready', uid: 1, size: text.length, raw: new File([text], name, { type }),
});
const result = (url = '/uploads/saved.txt') => ({ url, fileName: 'saved.txt', originalName: 'note.txt', mimeType: 'text/plain', size: 5 });
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() {
  await setImmediate();
  await vue.nextTick();
}
function harness(upload, overrides = {}, { defaultRequest = false, delayedModel = false } = {}) {
  const scope = vue.effectScope();
  const model = vue.ref('');
  const props = vue.reactive({ accept: '.txt', maxSizeMb: 20, disabled: false, contextKey: 'first',
    uploadRequest: defaultRequest ? undefined : upload, ...overrides });
  const events = [];
  const releases = [];
  const disposers = [];
  const registered = new Set();
  const commits = [];
  const exports = {};
  const imports = {
    vue: { ...vue,
      inject: () => ({ register: (control) => { registered.add(control); return () => registered.delete(control); } }),
      onBeforeUnmount: (callback) => disposers.push(callback),
    },
    'element-plus': { useFormItem: () => ({ form: { disabled: false }, formItem: { propString: 'attachmentUrl', validate: async () => true } }) },
    '@/api/upload': { uploadFile: upload, releaseUpload: async (url) => { releases.push(url); } },
    './uploadForm': { UPLOAD_FORM_KEY: Symbol('upload-form') },
    './uploadValidation': validators,
  };
  setup((name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, exports);
  const control = scope.run(() => exports.useSingleUpload(props, model, {
    events: Object.fromEntries(['uploading', 'status', 'progress', 'error'].map((name) => [name, (value) => events.push([name, value])])),
    commit: (value, selected, content) => {
      commits.push({ value, selected, content });
      if (!delayedModel) model.value = value.url;
    },
  }));
  return { props, model, events, releases, registered, commits, ...control,
    stop: () => { disposers.forEach((dispose) => dispose()); scope.stop(); } };
}

test('accept validates extensions and MIME wildcards, including empty browser MIME', () => {
  assert.equal(validators.matchesUploadAccept({ name: 'REPORT.PDF', type: '' }, '.pdf'), true);
  assert.equal(validators.matchesUploadAccept({ name: 'portrait.jpg', type: '' }, 'image/*'), true);
  assert.equal(validators.matchesUploadAccept({ name: 'portrait.jpg', type: 'application/pdf' }, 'image/*'), false);
  assert.equal(validators.matchesUploadAccept({ name: 'notes.txt', type: 'text/plain' }, '.pdf,image/*'), false);
  assert.throws(() => validators.validateUploadFile(new File([], 'empty.txt'), '', 20), /空文件/);
});

test('failed upload can retry and delayed parent model echo preserves success/progress', async (t) => {
  let calls = 0;
  const h = harness(async () => { if (++calls === 1) throw new Error('offline'); return result(); }, {}, { delayedModel: true });
  t.after(h.stop);
  h.handleChange(file());
  await settle();
  assert.equal(h.uploading.value, false);
  assert.equal(h.status.value, 'error');
  assert.equal(h.validate(), 'offline');
  assert.equal(h.canRetry.value, true);
  h.retry();
  await settle();
  assert.equal(calls, 2);
  assert.equal(h.status.value, 'success');
  h.model.value = h.commits.at(-1).value.url; // parent updates defineModel prop on its next render
  await vue.nextTick();
  assert.equal(h.status.value, 'success');
  assert.equal(h.progress.value, 100);
  assert.equal(h.validate(), true);
});

test('size rejection leaves no uploaded model and permits another selection', async (t) => {
  let calls = 0;
  const h = harness(async () => { ++calls; return result(); }, { maxSizeMb: 1 / 1024 / 1024 });
  t.after(h.stop);
  h.handleChange(file());
  await settle();
  assert.equal(calls, 0);
  assert.match(h.error.value, /不能超过/);
  assert.equal(h.model.value, '');
  h.handleChange(file('note.txt', 'a'));
  await settle();
  assert.equal(calls, 1);
  assert.equal(h.status.value, 'success');
});

test('Form registration rejects submission while upload is pending; cancellation clears it', async (t) => {
  const pending = deferred();
  let signal;
  const h = harness((_file, options) => { signal = options.signal; return pending.promise; });
  t.after(h.stop);
  h.handleChange(file());
  await settle();
  const registered = [...h.registered][0];
  assert.equal(registered.prop, 'attachmentUrl');
  assert.match(registered.validate(), /正在上传/);
  h.abort();
  assert.equal(signal.aborted, true);
  assert.equal(registered.validate(), true);
  pending.resolve(result());
  await settle();
  assert.equal(h.model.value, '');
  assert.equal(h.status.value, 'cancelled');
});

test('same empty model in a new context cannot receive a late result; default upload is released', async (t) => {
  const pending = deferred();
  const h = harness(() => pending.promise, {}, { defaultRequest: true });
  t.after(h.stop);
  h.handleChange(file());
  await settle();
  h.props.contextKey = 'second';
  assert.equal(h.uploading.value, false);
  pending.resolve(result('/uploads/old.txt'));
  await settle();
  assert.equal(h.model.value, '');
  assert.equal(h.commits.length, 0);
  assert.deepEqual(h.releases, ['/uploads/old.txt']);
});

test('a cancelled custom request ignoring AbortSignal cannot overwrite a later upload', async (t) => {
  const old = deferred();
  let calls = 0;
  const h = harness(() => ++calls === 1 ? old.promise : Promise.resolve(result('/uploads/new.txt')));
  t.after(h.stop);
  h.handleChange(file());
  await settle();
  h.abort();
  h.handleChange(file());
  await settle();
  old.resolve(result('/uploads/old.txt'));
  await settle();
  assert.equal(h.model.value, '/uploads/new.txt');
  assert.equal(h.status.value, 'success');
  assert.deepEqual(h.releases, []); // custom lifecycle remains owned by the business page
});

test('text read failure does not upload or partially commit URL/name/content', async (t) => {
  let calls = 0;
  const h = harness(async () => { ++calls; return result(); }, { readText: true });
  t.after(h.stop);
  const selected = file();
  selected.raw.text = async () => { throw new Error('cannot read text'); };
  h.handleChange(selected);
  await settle();
  assert.equal(calls, 0);
  assert.equal(h.commits.length, 0);
  assert.equal(h.model.value, '');
  assert.equal(h.error.value, 'cannot read text');
});

test('late asynchronous error decoding cannot restore an error after context reset', async (t) => {
  const errorBody = deferred();
  const blob = new Blob();
  blob.text = () => errorBody.promise;
  const h = harness(async () => { throw { response: { data: blob } }; });
  t.after(h.stop);
  h.handleChange(file());
  await settle();
  h.props.contextKey = 'second';
  errorBody.resolve('{"message":"old error"}');
  await settle();
  assert.equal(h.error.value, '');
  assert.equal(h.status.value, 'idle');
});
