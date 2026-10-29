import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextTick, reactive } from 'vue';
import { loadSetup, harness } from './inputFormTestHarness.mjs';

const common = ['validate', 'clearValidate', 'reset', 'error', 'effectiveDisabled', 'blocked'];
const setupForm = await loadSetup('./Form.vue', ['formRef', 'validate', 'clearValidate', 'resetFields']);
const setupNumber = await loadSetup('./InputNumber.vue', [...common, 'inputBuffer', 'handleInput', 'handleChange']);
const setupAmount = await loadSetup('./InputAmount.vue', [...common, 'amountEditing', 'percentEditing', 'activeMode',
  'handleAmountInput', 'handleAmountChange', 'handleAmountBlur', 'handlePercentInput', 'handlePercentChange',
  'handleModeToggle', 'handleClear']);
const setupEmail = await loadSetup('./InputEmail.vue', [...common, 'account', 'domain',
  'handleAccountInput', 'handleDomainChange', 'handleClear']);
const setupPhone = await loadSetup('./InputPhone.vue', [...common, 'handleInput', 'handleChange']);

test('mounted controls register their own rules in dynamic fields and slots, then unregister', async (t) => {
  const form = harness(setupForm, { fields: [] }, {});
  t.after(form.stop);
  form.formRef.value = { validate: async () => true };
  const children = [
    [setupNumber, { min: 10 }, 1, 'count'],
    [setupAmount, { min: 10 }, 2, 'amount'],
    [setupEmail, {}, 'abc@', 'email'],
    [setupPhone, {}, '12', 'phone'],
  ].map(([setup, props, value, prop]) => harness(setup, props, value, {
    provided: form.provided, formItemProp: prop,
  }));
  children.forEach((child) => t.after(child.stop));
  await assert.rejects(form.validate(), (errors) => {
    assert.deepEqual(Object.keys(errors).sort(), ['amount', 'count', 'email', 'phone']);
    return true;
  });
  children.forEach((child) => child.stop());
  assert.equal(await form.validate(), true);
});

test('Form combines same-field errors and recollects controls after asynchronous page validation', async (t) => {
  const form = harness(setupForm, { fields: [] }, {});
  const child = harness(setupPhone, {}, '12', { provided: form.provided, formItemProp: ['contact', 'phone'] });
  t.after(form.stop); t.after(child.stop);
  form.formRef.value = { validate: async () => { throw { 'contact.phone': [{ message: '业务校验错误' }] }; } };
  await assert.rejects(form.validate(), (errors) => {
    assert.deepEqual(errors['contact.phone'].map((entry) => entry.message), ['业务校验错误', '请输入正确的手机号']);
    return true;
  });
  form.formRef.value = { validate: async () => { child.model.value = '13800138000'; await nextTick(); return true; } };
  assert.equal(await form.validate(), true);
  child.model.value = '12';
  form.formRef.value = { validate: async () => { child.stop(); return true; } };
  assert.equal(await form.validate(), true);
});

test('clearValidate selects fields, accepts [] as all, and does not modify values or buffers', async (t) => {
  const form = harness(setupForm, { fields: [] }, {});
  const amount = harness(setupAmount, { min: 10 }, 1, { provided: form.provided, formItemProp: 'amount' });
  const phone = harness(setupPhone, {}, '12', { provided: form.provided, formItemProp: 'phone' });
  t.after(form.stop); t.after(amount.stop); t.after(phone.stop);
  const cleared = [];
  form.formRef.value = { clearValidate: (fields) => cleared.push(fields) };
  amount.handleAmountInput('1.00');
  await nextTick();
  amount.validate(); phone.validate();
  form.clearValidate('phone');
  assert.equal(phone.error.value, '');
  assert.equal(amount.error.value, '不能小于 10');
  form.clearValidate([]);
  assert.equal(amount.error.value, '');
  assert.equal(amount.amountEditing.value, '1.00');
  assert.equal(amount.model.value, 1);
  assert.deepEqual(cleared, ['phone', []]);
});

test('resetFields synchronizes buffers after model reset, even when numeric value stays equal', async (t) => {
  const form = harness(setupForm, { fields: [] }, {});
  const amount = harness(setupAmount, {}, 1, { provided: form.provided, formItemProp: 'amount' });
  const email = harness(setupEmail, {}, 'old@example.com', { provided: form.provided, formItemProp: 'email' });
  t.after(form.stop); t.after(amount.stop); t.after(email.stop);
  amount.handleAmountInput('1.00');
  email.handleAccountInput('bad@');
  email.validate();
  form.formRef.value = { resetFields: () => { amount.model.value = 1; email.model.value = 'new@example.com'; } };
  await form.resetFields();
  assert.equal(amount.amountEditing.value, '1');
  assert.equal(email.account.value, 'new');
  assert.equal(email.domain.value, 'example.com');
  assert.equal(email.error.value, '');
});

test('amount input retains bounds violations and editing buffers, including percent conversion', async (t) => {
  const h = harness(setupAmount, { min: 10, max: 300, totalAmount: 200 }, 60);
  t.after(h.stop);
  for (const text of ['1', '18', '180']) {
    h.handleAmountInput(text);
    await nextTick();
    assert.equal(h.model.value, Number(text));
    assert.equal(h.amountEditing.value, text);
  }
  h.handleAmountChange('301');
  assert.equal(h.model.value, 301);
  assert.equal(h.error.value, '不能大于 300');
  h.handleAmountInput('-');
  await nextTick();
  assert.equal(h.model.value, null);
  assert.equal(h.amountEditing.value, '-');
  h.handleAmountBlur({});
  assert.equal(h.amountEditing.value, '');
  h.handlePercentInput('2.50');
  await nextTick();
  assert.equal(h.model.value, 5);
  assert.equal(h.percentEditing.value, '2.50');
  h.handlePercentChange('2.50');
  assert.equal(h.model.value, 5);
  assert.equal(h.error.value, '不能小于 10');
  h.handlePercentChange('50');
  assert.equal(h.model.value, 100);
  assert.equal(h.validate(), true);
  h.model.value = 80;
  await nextTick();
  assert.equal(h.amountEditing.value, '80');
  assert.equal(h.percentEditing.value, '40');
});

test('disabled/readonly compound controls guard every write path and inherit parent disabled', (t) => {
  for (const setting of [{ disabled: true }, { readonly: true }, {}]) {
    const parentForm = reactive({ disabled: !Object.keys(setting).length });
    const amount = harness(setupAmount, { ...setting, totalAmount: 200 }, 100, { parentForm });
    const email = harness(setupEmail, setting, 'user@example.com', { parentForm });
    t.after(amount.stop); t.after(email.stop);
    amount.handleAmountInput('10'); amount.handlePercentChange('20'); amount.handleModeToggle(); amount.handleClear();
    email.handleAccountInput('changed'); email.handleDomainChange('qq.com'); email.handleClear();
    assert.equal(amount.model.value, 100);
    assert.equal(amount.activeMode.value, 'amount');
    assert.equal(email.model.value, 'user@example.com');
    assert.equal(email.domain.value, 'example.com');
    assert.equal(amount.events.length, 0);
    assert.equal(email.events.length, 0);
    if (!Object.keys(setting).length) {
      parentForm.disabled = false;
      email.handleDomainChange('qq.com');
      amount.handleModeToggle();
      assert.equal(email.model.value, 'user@qq.com');
      assert.equal(amount.activeMode.value, 'percent');
    }
  }
});

test('controlled models emit and validate the new input before parent props echo back', async (t) => {
  const amount = harness(setupAmount, { totalAmount: 200, min: 10 }, 60, { controlled: true });
  const phone = harness(setupPhone, {}, '13800138000', { controlled: true });
  const email = harness(setupEmail, {}, 'user@example.com', { controlled: true });
  const number = harness(setupNumber, { min: 10 }, 60, { controlled: true });
  for (const h of [amount, phone, email, number]) t.after(h.stop);
  amount.handlePercentChange('2.5');
  phone.handleChange('12');
  email.handleDomainChange('invalid');
  number.handleChange('1');
  assert.deepEqual(amount.events.at(-1), ['change', 5]);
  assert.equal(amount.amountEditing.value, '5');
  assert.equal(amount.error.value, '不能小于 10');
  assert.deepEqual(phone.events.at(-1), ['change', '12']);
  assert.equal(phone.error.value, '请输入正确的手机号');
  assert.deepEqual(email.events.at(-1), ['change', 'user@invalid']);
  assert.equal(email.error.value, '请输入正确的邮箱');
  assert.deepEqual(number.events.at(-1), ['change', 1]);
  assert.equal(number.error.value, '不能小于 10');
  for (const h of [amount, phone, email, number]) h.flushModel();
  await nextTick();
  assert.equal(amount.model.value, 5);
  assert.equal(phone.model.value, '12');
  assert.equal(email.model.value, 'user@invalid');
  assert.equal(number.model.value, 1);
});
