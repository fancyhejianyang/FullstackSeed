import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as vue from 'vue';
import { parse, compileTemplate } from '@vue/compiler-sfc';
import ts from 'typescript';

const source = await readFile(new URL('./Edit.vue', import.meta.url), 'utf8');
function harness() {
  const exports = {};
  const scope = vue.effectScope();
  const parsed = parse(source);
  const script =
    parsed.descriptor.scriptSetup.content +
    '\nexport { form, fields, fillForm, resetForm, buildPayload, formReadyForModelValidation };';
  scope.run(() =>
    new Function(
      'require',
      'exports',
      'defineProps',
      'defineEmits',
      'defineModel',
      ts.transpileModule(script, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    )(
      (name) => {
        if (name === 'vue') return vue;
        if (name === '@/stores/user')
          return { useUserStore: () => ({ hasPermission: () => true }) };
        if (name === '@/api/knowledgeAiProvider')
          return {
            validateKnowledgeAiProviderModel: () =>
              assert.fail('must not call real model'),
          };
        return {};
      },
      exports,
      () => ({ row: null }),
      () => () => {},
      () => vue.ref(false),
    ),
  );
  return { ...exports, close: () => scope.stop() };
}

test('内容创作可选纯文本/Markdown，保存时不覆盖已选格式', async () => {
  const h = harness();
  h.formReadyForModelValidation.value = true;
  h.form.responseFormat = 'markdown';
  h.form.featureType = 'contentCreation';
  await vue.nextTick();
  assert.equal(h.form.responseFormat, 'text');
  const field = h.fields.value.find((item) => item.prop === 'responseFormat');
  assert.deepEqual(
    field.options.map((item) => item.value),
    ['text', 'markdown'],
  );
  assert.equal(field.componentProps?.disabled, undefined);
  for (const format of ['text', 'markdown']) {
    h.form.responseFormat = format;
    assert.equal(h.buildPayload().responseFormat, format);
  }
  h.close();
});
test('打开历史创作配置保留 Markdown；重新打开纯文本配置也不重置', async () => {
  const h = harness();
  h.fillForm({
    name: '旧配置',
    featureType: 'contentCreation',
    responseFormat: 'markdown',
  });
  await vue.nextTick();
  assert.equal(h.buildPayload().responseFormat, 'markdown');
  h.fillForm({
    name: '纯文本配置',
    featureType: 'contentCreation',
    responseFormat: 'text',
  });
  await vue.nextTick();
  assert.equal(h.buildPayload().responseFormat, 'text');
  h.close();
});
test('解析固定 Markdown、重排固定 JSON，聊天仍保留原有格式选项', async () => {
  const h = harness();
  for (const featureType of ['documentParse', 'ocr']) {
    h.form.featureType = featureType;
    await vue.nextTick();
    assert.equal(h.buildPayload().responseFormat, 'markdown');
    assert.equal(
      h.fields.value.find((item) => item.prop === 'responseFormat')
        .componentProps.disabled,
      true,
    );
  }
  h.form.featureType = 'rerank';
  await vue.nextTick();
  assert.equal(h.buildPayload().responseFormat, 'json');
  h.form.featureType = 'chat';
  await vue.nextTick();
  assert.deepEqual(
    h.fields.value
      .find((item) => item.prop === 'responseFormat')
      .options.map((item) => item.value),
    ['text', 'json', 'markdown'],
  );
  h.close();
});
test('配置模板可编译，创作模式无固定 Markdown 提示', () => {
  const parsed = parse(source);
  assert.deepEqual(
    compileTemplate({
      source: parsed.descriptor.template.content,
      filename: 'Edit.vue',
      id: 'format-test',
    }).errors,
    [],
  );
  assert.doesNotMatch(source, /文章正文固定输出 Markdown/);
});
