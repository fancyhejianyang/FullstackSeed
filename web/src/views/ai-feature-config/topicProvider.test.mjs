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
  models: 'shared-text\nhy3\ndeepseek-v4-flash\ndeepseek-v4-flash-202605',
  textModels: 'shared-text',
});

async function harness(t, initial = {}, { checkEndpoint } = {}) {
  const exported = {};
  const scheduled = [];
  const checked = [];
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
              get: (_target, key) =>
                key === 'checkAiFeatureModelEndpoint' && checkEndpoint
                  ? async (payload) => {
                      checked.push(payload);
                      return checkEndpoint(payload);
                    }
                  : forbiddenRequest,
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
    provider(5, 'tencentTokenhub'),
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
    checked,
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
    ['disabled', 'tokenhubSearch'],
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

test('腾讯原生搜索使用系统规则，回填保持选择且不触发真实请求', async (t) => {
  const h = await harness(
    t,
    { providerId: 2, model: 'hy3', webSearchMode: 'tokenhubSearch' },
    {
      checkEndpoint: async () => ({
        functionType: 'chat',
        functionLabel: '普通调用',
        source: 'builtin',
        ruleName: '腾讯普通调用',
        apiPath: '/v1/chat/completions',
        searchApiPath: '/v1/responses',
      }),
    },
  );
  assert.equal(h.form.webSearchMode, 'tokenhubSearch');
  assert.equal(h.scheduled.length, 0);
  assert.equal(h.checked.length, 0);
  assert.match(
    vue.unref(h.searchField().hint),
    /自动选择联网接口.*无需逐个配置卡片.*专用卡片优先/,
  );
  assert.match(vue.unref(h.searchField().hint), /以真实测试返回的搜索来源为准/);
  h.formReadyForModelValidation.value = true;
  assert.equal(await h.validateSelectedModel(), true);
  assert.equal(h.checked.length, 1);
  assert.equal(h.checked[0].webSearchMode, 'tokenhubSearch');
  assert.equal(h.checked[0].model, 'hy3');
  assert.equal(h.scheduled.length, 0);
});

test('腾讯切换模型及同平台账号保留原生搜索，仅检查最终模型且不猜联网别名', async (t) => {
  const h = await harness(
    t,
    { providerId: 2, model: 'hy3', webSearchMode: 'tokenhubSearch' },
    {
      checkEndpoint: async () => ({
        functionType: 'chat',
        functionLabel: '普通调用',
        source: 'builtin',
        ruleName: '腾讯普通调用',
        apiPath: '/v1/chat/completions',
        searchApiPath: '/v1/responses',
      }),
    },
  );
  h.formReadyForModelValidation.value = true;
  h.form.model = 'deepseek-v4-flash';
  h.form.model = 'deepseek-v4-flash-202605';
  await vue.nextTick();
  await vue.nextTick();
  assert.equal(h.form.webSearchMode, 'tokenhubSearch');
  assert.equal(h.scheduled.length, 1);
  assert.equal(h.scheduled[0].selection.model, 'deepseek-v4-flash-202605');
  assert.equal(h.scheduled[0].selection.webSearchMode, 'tokenhubSearch');
  assert.equal(await h.validateSelectedModel(), true);
  assert.equal(h.checked.at(-1).model, 'deepseek-v4-flash-202605');
  assert.match(
    h.modelValidationHint.value,
    /联网搜索：\/v1\/responses.*仅检查配置，未调用模型/,
  );
  assert.equal(h.form.model, 'deepseek-v4-flash-202605');
  assert.equal(h.form.webSearchMode, 'tokenhubSearch');
  h.form.providerId = 5;
  await vue.nextTick();
  assert.equal(h.form.webSearchMode, 'tokenhubSearch');
});

test('离开腾讯清除不兼容搜索，切回不自动开启；腾讯不联网配置也不自动升级', async (t) => {
  const h = await harness(t, {
    providerId: 2,
    webSearchMode: 'tokenhubSearch',
  });
  h.formReadyForModelValidation.value = true;
  h.form.providerId = 1;
  await vue.nextTick();
  assert.equal(h.form.webSearchMode, 'disabled');
  h.form.providerId = 2;
  await vue.nextTick();
  assert.equal(h.form.webSearchMode, 'disabled');
  h.form.model = 'hy3';
  await vue.nextTick();
  assert.equal(h.form.webSearchMode, 'disabled');
  assert.equal(h.buildPayload().webSearchMode, 'disabled');
});

test('腾讯联网历史值遇到百炼账号时保留并提示不适用，不静默改成 Responses', async (t) => {
  const h = await harness(t, { webSearchMode: 'tokenhubSearch' });
  assert.equal(h.form.webSearchMode, 'tokenhubSearch');
  assert.equal(h.scheduled.length, 0);
  const invalid = vue
    .unref(h.searchField().options)
    .find((item) => item.value === 'tokenhubSearch');
  assert.equal(invalid.disabled, true);
  assert.match(invalid.label, /当前账号不适用/);
  h.formReadyForModelValidation.value = true;
  assert.equal(await h.validateSelectedModel(), false);
  assert.equal(h.form.webSearchMode, 'tokenhubSearch');
  assert.match(h.modelValidationHint.value, /未发起实际测试/);
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
