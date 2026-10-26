import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as vue from 'vue';
import { parse } from '@vue/compiler-sfc';
import ts from 'typescript';

const source = await readFile(new URL('./Edit.vue', import.meta.url), 'utf8');
const script =
  parse(source).descriptor.scriptSetup.content +
  '\nexport { form, fields, providers, fillForm, buildPayload, formReadyForModelValidation, validateSelectedModel, modelValidationHint, currentTestSelection, selectionKey };';
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

test('热点配置不再提供联网方式；旧协议不回填或提交', async (t) => {
  for (const providerId of [1, 2, 3, 4]) {
    const h = await harness(t, { providerId, webSearchMode: 'tokenhubSearch' });
    assert.equal(h.searchField(), undefined);
    assert.equal('webSearchMode' in h.form, false);
    assert.equal('webSearchMode' in h.buildPayload(), false);
    assert.equal(h.scheduled.length, 0);
    assert.equal(h.form.model, 'shared-text');
  }
});

test('热点模型匹配仅检查普通调用，旧联网值不再阻止保存', async (t) => {
  const h = await harness(
    t,
    { providerId: 2, model: 'hy3', webSearchMode: 'bailianResponses' },
    {
      checkEndpoint: async () => ({
        functionType: 'chat',
        functionLabel: '普通通用',
        source: 'builtin',
        ruleName: '腾讯普通调用',
        apiPath: '/v1/chat/completions',
        searchApiPath: null,
      }),
    },
  );
  assert.equal(await h.validateSelectedModel(), true);
  assert.equal(h.checked.length, 1);
  assert.equal(h.checked[0].model, 'hy3');
  assert.equal('webSearchMode' in h.checked[0], false);
  assert.match(h.modelValidationHint.value, /普通通用/);
  assert.doesNotMatch(h.modelValidationHint.value, /联网搜索/);
});

test('切换模型和平台仍真实测试普通调用，不传联网协议', async (t) => {
  const h = await harness(t, { providerId: 2, model: 'hy3' });
  h.formReadyForModelValidation.value = true;
  h.form.model = 'deepseek-v4-flash-202605';
  await vue.nextTick();
  assert.equal(h.scheduled.length, 1);
  assert.equal(h.scheduled[0].selection.model, 'deepseek-v4-flash-202605');
  assert.equal('webSearchMode' in h.scheduled[0].selection, false);
  h.form.providerId = 1;
  await vue.nextTick();
  assert.equal(h.scheduled.at(-1).selection.providerId, 1);
  assert.equal('webSearchMode' in h.scheduled.at(-1).selection, false);
});

test('历史联网测试不混同当前普通调用选择', async (t) => {
  const h = await harness(t, { providerId: 2, model: 'hy3' });
  const selection = h.currentTestSelection();
  assert.notEqual(
    h.selectionKey(selection),
    h.selectionKey({ ...selection, webSearchMode: 'tokenhubSearch' }),
  );
  assert.equal(
    h.selectionKey(selection),
    h.selectionKey({ ...selection, webSearchMode: 'disabled' }),
  );
});

test('内容创作与热点切换保持格式约束，不自动启用或提交联网配置', async (t) => {
  const h = await harness(t, {
    featureType: 'contentCreation',
    webSearchMode: 'tokenhubSearch',
  });
  assert.equal(h.searchField(), undefined);
  assert.equal(h.buildPayload().responseFormat, 'text');
  assert.equal('webSearchMode' in h.buildPayload(), false);
  h.formReadyForModelValidation.value = true;
  h.form.featureType = 'topicDiscovery';
  await vue.nextTick();
  assert.equal(h.buildPayload().responseFormat, 'json');
  assert.equal('webSearchMode' in h.buildPayload(), false);
});

test('厂商接口公开类型不再暴露联网搜索功能、类别及专用协议', async () => {
  const endpointApi = await readFile(
    new URL('../../api/modelEndpoint.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    endpointApi,
    /"webSearch"|"openaiChatSearch"|"openaiResponses"|"search"/,
  );
  assert.doesNotMatch(
    source,
    /prop: "webSearchMode"|form\.webSearchMode|platformSearchMode/,
  );
});
