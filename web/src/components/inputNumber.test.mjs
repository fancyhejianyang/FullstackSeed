import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as vue from 'vue';
import { loadSetup, harness, uploadFormKey } from './inputFormTestHarness.mjs';

// 使用真实组件脚本与 Vue 响应式，覆盖 v-model 返回值后的输入缓冲行为。
// 不依赖 DOM，不把这些用例当作浏览器输入/光标测试。
const setupNumber = await loadSetup('./InputNumber.vue', [
  'inputBuffer',
  'error',
  'handleInput',
  'handleChange',
  'handleBlur',
  'handleClear',
  'handleEnter',
  'validate',
]);
const setupForm = await loadSetup('./Form.vue', [
  'formRef',
  'validate',
  'resetUploads',
]);

test('Form blocks pending and failed slot uploads, and resets them with the form', async (t) => {
  const h = harness(setupForm, { fields: [] }, {});
  t.after(h.stop);
  h.formRef.value = { validate: async () => true };
  const pending = vue.ref(true);
  let uploadError = '';
  let resetCount = 0;
  const unregister = h.provided.get(uploadFormKey).register({
    prop: 'attachmentUrl',
    uploading: pending,
    validate: () => pending.value ? '上传中' : uploadError || true,
    reset: () => { resetCount += 1; pending.value = false; uploadError = ''; },
  });
  await assert.rejects(h.validate(), (fields) => fields.attachmentUrl[0].message === '上传中');
  pending.value = false;
  uploadError = '上传失败';
  await assert.rejects(h.validate(), (fields) => fields.attachmentUrl[0].message === '上传失败');
  h.resetUploads();
  assert.equal(resetCount, 1);
  assert.equal(await h.validate(), true);
  pending.value = true;
  unregister();
  assert.equal(await h.validate(), true);
});

test('Form rechecks uploads that start during asynchronous field validation', async (t) => {
  const h = harness(setupForm, { fields: [] }, {});
  t.after(h.stop);
  const pending = vue.ref(false);
  h.provided.get(uploadFormKey).register({
    prop: 'imageUrl', uploading: pending,
    validate: () => pending.value ? '上传中' : true,
    reset: () => {},
  });
  h.formRef.value = { validate: async () => { pending.value = true; return true; } };
  await assert.rejects(h.validate(), (fields) => fields.imageUrl[0].message === '上传中');
});

test('typing 1 -> 18 -> 180 is not clamped by min=10, even after model watchers flush', async (t) => {
  const h = harness(setupNumber, { mode: 'integer', min: 10, max: 300 }, 60);
  t.after(h.stop);
  for (const value of ['1', '18', '180']) {
    h.handleInput(value);
    await vue.nextTick();
    assert.equal(h.inputBuffer.value, value);
    assert.equal(h.model.value, Number(value));
    assert.equal(h.error.value, '');
  }
  h.handleBlur({});
  assert.equal(h.validate(), true);
  assert.equal(h.model.value, 180);
});

test('out-of-range values remain unchanged on blur, change and validation; Enter is blocked', async (t) => {
  const h = harness(setupNumber, { min: 10, max: 300 });
  t.after(h.stop);
  for (const [value, message] of [
    ['1', '不能小于 10'],
    ['301', '不能大于 300'],
  ]) {
    h.handleInput(value);
    await vue.nextTick();
    h.handleChange(value);
    h.handleBlur({});
    assert.equal(h.model.value, Number(value));
    assert.equal(h.inputBuffer.value, value);
    assert.equal(h.error.value, message);
    assert.equal(h.validate(), message);
    h.handleEnter();
  }
  assert.equal(h.events.filter(([event]) => event === 'enter').length, 0);
  for (const value of ['10', '300']) {
    h.handleInput(value);
    assert.equal(h.error.value, '');
    assert.equal(h.validate(), true);
  }
  h.handleEnter();
  assert.deepEqual(h.events.at(-1), ['enter', 300]);
});

test('negative numbers and decimal buffers survive numeric model echo', async (t) => {
  const h = harness(setupNumber, { mode: 'money', precision: 2 }, 7);
  t.after(h.stop);
  for (const [text, value] of [
    ['-', null],
    ['-.', null],
    ['-.5', -0.5],
    ['-0.', -0],
    ['-0.20', -0.2],
    ['1.', 1],
    ['1.20', 1.2],
  ]) {
    h.handleInput(text);
    await vue.nextTick();
    assert.equal(h.inputBuffer.value, text);
    assert.equal(h.model.value, value);
  }
  h.handleInput('1.234');
  await vue.nextTick();
  assert.equal(h.inputBuffer.value, '1.23');
  assert.equal(h.model.value, 1.23);
  h.handleInput('.');
  await vue.nextTick();
  assert.equal(h.inputBuffer.value, '.');
  assert.equal(h.model.value, null);
  h.handleBlur({});
  assert.equal(h.inputBuffer.value, '');
});

test('external model updates, clearing, required and custom rule options still work', async (t) => {
  const h = harness(setupNumber, { min: 10, required: true }, 60);
  t.after(h.stop);
  h.handleInput('1');
  assert.equal(h.validate(), '不能小于 10');
  h.model.value = 180;
  await vue.nextTick();
  assert.equal(h.inputBuffer.value, '180');
  assert.equal(h.error.value, '');
  h.handleClear();
  assert.equal(h.model.value, null);
  assert.equal(h.inputBuffer.value, '');
  assert.equal(h.validate(), '该字段不能为空');
  h.props.rulesEnabled = false;
  assert.equal(h.validate(), true);
  h.props.rulesEnabled = true;
  h.props.rules = [(value) => value === 5 || '仅允许 5'];
  h.handleInput('5');
  assert.equal(h.validate(), true); // 自定义规则覆盖 min=10。
  h.handleInput('6');
  assert.equal(h.validate(), '仅允许 5');
});

test('Form rejects invalid InputNumber values even without page-level range rules', async (t) => {
  const form = harness(
    setupForm,
    {
      fields: [{ prop: 'timeoutSeconds', component: 'InputNumber' }],
    },
    {},
  );
  const number = harness(setupNumber, { mode: 'integer', min: 10, max: 300 }, null, {
    provided: form.provided,
    formItemProp: 'timeoutSeconds',
  });
  t.after(number.stop);
  t.after(form.stop);
  let pageValidationCount = 0;
  form.formRef.value = {
    validate: async () => {
      pageValidationCount++;
      return true;
    },
  };
  number.handleInput('1');
  await vue.nextTick();
  await assert.rejects(form.validate(), (fields) => {
    assert.equal(fields.timeoutSeconds[0].message, '不能小于 10');
    return true;
  });
  assert.equal(number.model.value, 1);
  assert.equal(number.error.value, '不能小于 10');
  number.handleInput('180');
  await vue.nextTick();
  assert.equal(await form.validate(), true);
  assert.equal(pageValidationCount, 2);
});

test('Form validates mounted slot inputs and removes their errors after unmount', async (t) => {
  const form = harness(setupForm, { fields: [{ prop: 'count', label: '数量', slot: true }] }, {});
  t.after(form.stop);
  const number = harness(setupNumber, { min: 10 }, 1, {
    provided: form.provided,
    formItemProp: 'count',
  });
  t.after(number.stop);
  form.formRef.value = { validate: async () => true };
  await assert.rejects(form.validate(), (fields) => fields.count[0].message === '不能小于 10');
  number.stop();
  assert.equal(await form.validate(), true);
});
