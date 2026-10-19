import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as vue from 'vue';
import { parse } from '@vue/compiler-sfc';
import ts from 'typescript';

const source = await readFile(
  new URL('./GenerationSettings.vue', import.meta.url),
  'utf8',
);
const helper = await readFile(
  new URL('./generationRequest.ts', import.meta.url),
  'utf8',
);
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await vue.nextTick();
}

function harness() {
  const configId = vue.ref(5);
  const templateId = vue.ref(8);
  const state = {
    failure: false,
    permission: true,
    configs: {
      list: [{ id: 5, name: '已选', model: 'm1', responseFormat: 'text' }],
      total: 1,
    },
  };
  const calls = [];
  const unmount = [];
  const module = {};
  const scope = vue.effectScope();
  scope.run(() =>
    new Function(
      'require',
      'exports',
      'defineProps',
      'defineModel',
      compile(
        parse(source).descriptor.scriptSetup.content +
          '\nexport { configValue, templateValue, configOptions, templateOptions, configError, fetchConfigs, fetchTemplates };',
      ),
    )(
      (name) => {
        if (name === 'vue')
          return { ...vue, onBeforeUnmount: (fn) => unmount.push(fn) };
        if (name === '@/api/contentArticle')
          return {
            getContentGenerationConfigs: async () => {
              calls.push('configs');
              if (state.failure) throw Error('failed');
              return await state.configs;
            },
          };
        if (name === '@/api/contentTemplate')
          return {
            getContentTemplates: async () => {
              calls.push('templates');
              return { list: [{ id: 8, name: '热点' }], total: 1 };
            },
          };
        if (name === '@/stores/user')
          return {
            useUserStore: () => ({ hasPermission: () => state.permission }),
          };
        if (name.endsWith('.vue')) return {};
        throw Error(name);
      },
      module,
      () => ({}),
      (name) => (name === 'aiConfigId' ? configId : templateId),
    ),
  );
  return {
    ...module,
    state,
    calls,
    configId,
    templateId,
    close: () => {
      unmount.forEach((fn) => fn());
      scope.stop();
    },
  };
}

test('生成设置加载只读选项并回显模型，修改或清空仅更新表单', async () => {
  const h = harness();
  await flush();
  assert.equal(h.configValue.value, '5');
  assert.match(h.configOptions.value[0].text, /m1.*纯文本/);
  assert.equal(h.templateValue.value, '8');
  h.configValue.value = '9';
  h.templateValue.value = null;
  assert.equal(h.configId.value, 9);
  assert.equal(h.templateId.value, null);
  assert.deepEqual(h.calls, ['configs', 'templates']);
  h.close();
});

test('设置搜索保留已选项；选项加载失败不清空保存值，卸载丢弃迟到结果', async () => {
  const h = harness();
  await flush();
  h.state.configs = {
    list: [{ id: 9, name: '其它', model: 'm2' }],
    total: 101,
  };
  await h.fetchConfigs('其它');
  assert.deepEqual(
    h.configOptions.value.map((row) => row.value),
    ['5', '9'],
  );
  h.state.failure = true;
  await h.fetchConfigs();
  assert.equal(h.configError.value, true);
  assert.equal(h.configId.value, 5);
  h.state.permission = false;
  await h.fetchTemplates();
  assert.equal(h.calls.filter((name) => name === 'templates').length, 1);
  h.state.failure = false;
  let resolve;
  h.state.configs = new Promise((done) => {
    resolve = done;
  });
  const pending = h.fetchConfigs();
  h.close();
  resolve({ list: [], total: 0 });
  await pending;
  assert.deepEqual(
    h.configOptions.value.map((row) => row.value),
    ['5', '9'],
  );
});

test('明确拒绝后重新读取设置，网络/服务端异常保留原请求避免重复计费', async () => {
  for (const status of [400, 403, 404, 409, 500, undefined]) {
    const module = {};
    const calls = [];
    let failure = true;
    new Function('require', 'exports', compile(helper))(
      () => ({
        generateContentArticle: async (_id, data) => {
          calls.push(data);
          if (failure) throw { response: { status } };
        },
      }),
      module,
    );
    const submit = module.createGenerationSubmitter();
    let reads = 0;
    const resolve = async () => ({ version: ++reads, aiConfigId: 5 });
    await assert.rejects(submit(1, resolve));
    failure = false;
    assert.equal(await submit(1, resolve), true);
    assert.equal(reads, status && status < 500 ? 2 : 1);
    assert.equal(
      calls[0].requestId === calls[1].requestId,
      !status || status >= 500,
    );
  }
});
