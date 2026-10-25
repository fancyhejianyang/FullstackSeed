import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as vue from 'vue';
import { parse } from '@vue/compiler-sfc';
import ts from 'typescript';

const source = await readFile(new URL('./Edit.vue', import.meta.url), 'utf8');
const script =
  parse(source).descriptor.scriptSetup.content +
  '\nexport { form, fields, providers, fillForm, buildPayload, formReadyForModelValidation, validateSelectedModel, modelValidationHint };';
const compiled = ts.transpileModule(script, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const provider = (id, platformType) => ({
  id,
  // Deliberately misleading names ensure choices use platformType, not names.
  name: id === 1 ? '腾讯名字的百炼账号' : '阿里名字的其他平台账号',
  platformType,
  isEnabled: true,
  models: 'shared-text',
  textModels: 'shared-text',
});

async function harness(t, initial = {}) {
  const exported = {};
  const scheduled = [];
  const scope = vue.effectScope();
  t.after(() => scope.stop());
  class QueueStub {
    open() {}
    close() {}
    cancelPending() {
      scheduled.length = 0;
    }
    activeValueFor() {
      return undefined;
    }
    schedule(job) {
      scheduled.push(job);
      return job;
    }
  }
  class HistoryStub {
    clear() {}
    store(record) {
      return [record];
    }
  }
  const forbiddenRequest = () => assert.fail('must not invoke a real request');
  scope.run(() =>
    new Function(
      'require',
      'exports',
      'defineProps',
      'defineEmits',
      'defineModel',
      compiled,
    )(
      (name) => {
        if (name === 'vue') return { ...vue, onBeforeUnmount() {} };
        if (name === '@/utils/featureModelTest')
          return {
            FeatureModelTestQueue: QueueStub,
            FeatureModelTestHistory: HistoryStub,
          };
        if (name === 'axios') return { isAxiosError: () => false };
        if (name === 'element-plus')
          return {
            ElMessage: { info() {}, warning() {}, error() {}, success() {} },
          };
        if (name === '@/api/aiFeatureConfig')
          return new Proxy(
            {},
            {
              get: () => forbiddenRequest,
            },
          );
        if (name === '@/api/thirdPartyConfig')
          return {
            getThirdPartyOptions: forbiddenRequest,
          };
        return {};
      },
      exported,
      () => ({ row: null }),
      () => () => {},
      // Start open without triggering the non-immediate loading watcher.
      () => vue.ref(true),
    ),
  );
  exported.providers.value = [
    provider(1, 'aliyunBailian'),
    provider(2, 'tencentTokenhub'),
    provider(3, 'custom'),
    provider(4, undefined),
  ];
  exported.fillForm({
    name: '热点测试',
    featureType: 'topicDiscovery',
    providerId: 1,
    model: 'shared-text',
    webSearchMode: 'bailianResponses',
    ...initial,
  });
  await vue.nextTick();
  return {
    ...exported,
    scheduled,
    searchField: () =>
      exported.fields.value.find((field) => field.prop === 'webSearchMode'),
  };
}

test('仅后端标记为百炼的平台可选 Responses，不根据账号名称判断', async (t) => {
  const h = await harness(t);
  assert.deepEqual(
    vue
      .unref(h.searchField().options)
      .filter((item) => !item.disabled)
      .map((item) => item.value),
    ['disabled', 'bailianResponses'],
  );
  h.formReadyForModelValidation.value = true;
  h.form.providerId = 2;
  assert.equal(h.form.webSearchMode, 'disabled');
  assert.deepEqual(
    vue.unref(h.searchField().options).map((item) => item.value),
    ['disabled'],
  );
  await vue.nextTick();
  await vue.nextTick();
  assert.equal(h.scheduled.at(-1)?.selection.webSearchMode, 'disabled');
  assert.equal(h.buildPayload().webSearchMode, 'disabled');
});

test('切回百炼不自动重新开启联网', async (t) => {
  const h = await harness(t);
  h.formReadyForModelValidation.value = true;
  h.form.providerId = 2;
  await vue.nextTick();
  h.form.providerId = 1;
  await vue.nextTick();
  assert.equal(h.form.webSearchMode, 'disabled');
  assert.ok(
    vue
      .unref(h.searchField().options)
      .some((item) => item.value === 'bailianResponses' && !item.disabled),
  );
});

test('历史不兼容组合保留原值并提示重新选择，回填及本地检查不发请求', async (t) => {
  const h = await harness(t, { providerId: 2 });
  assert.equal(h.form.webSearchMode, 'bailianResponses');
  assert.equal(h.scheduled.length, 0);
  const legacy = vue
    .unref(h.searchField().options)
    .find((item) => item.value === 'bailianResponses');
  assert.equal(legacy.disabled, true);
  assert.match(legacy.label, /不适用/);
  h.formReadyForModelValidation.value = true;
  assert.equal(await h.validateSelectedModel(), false);
  assert.match(h.modelValidationHint.value, /未发起实际测试/);
  assert.equal(h.form.webSearchMode, 'bailianResponses');
});

test('自定义或缺失平台信息时保守关闭，仍允许选择不联网推荐', async (t) => {
  const h = await harness(t);
  h.formReadyForModelValidation.value = true;
  for (const id of [3, 4]) {
    h.form.providerId = id;
    await vue.nextTick();
    assert.equal(h.form.webSearchMode, 'disabled');
    assert.deepEqual(
      vue.unref(h.searchField().options).map((item) => item.value),
      ['disabled'],
    );
    assert.match(vue.unref(h.searchField().hint), /尚未接入/);
  }
});

test('离开热点功能清除联网协议，返回热点也不自动开启', async (t) => {
  const h = await harness(t);
  h.formReadyForModelValidation.value = true;
  h.form.featureType = 'contentCreation';
  await vue.nextTick();
  assert.equal(h.searchField(), undefined);
  assert.equal(h.buildPayload().webSearchMode, 'disabled');
  assert.equal(h.form.responseFormat, 'text');
  h.form.featureType = 'topicDiscovery';
  await vue.nextTick();
  assert.equal(h.form.webSearchMode, 'disabled');
  assert.equal(h.buildPayload().responseFormat, 'json');
});
