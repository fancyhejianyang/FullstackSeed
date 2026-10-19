import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as vue from 'vue';
import { parse, compileTemplate, compileStyle } from '@vue/compiler-sfc';
import ts from 'typescript';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const editor = await read('./Edit.vue');
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
  const props = vue.reactive({ row: null });
  const visible = vue.ref(false);
  const calls = [];
  const state = {
    detail: {
      id: 1,
      title: '旧标题',
      idea: '原始想法',
      content: '原文',
      coverUrl: '',
      version: 4,
    },
    result: { id: 20, status: 'pending', articleId: 1, articleVersion: 4 },
    confirm: true,
    saveError: false,
  };
  const api = {
    getContentArticle: async (id) => {
      calls.push(['detail', id]);
      return await state.detail;
    },
    generateContentArticle: async (id, data) => {
      calls.push(['generate', id, data]);
      return await state.result;
    },
    createContentArticle: async (data) => {
      calls.push(['create', data]);
      if (state.saveError) throw Error('save failed');
      return { id: 1, version: 1, ...data };
    },
    updateContentArticle: async (id, data) => {
      calls.push(['update', id, data]);
      if (state.saveError) throw Error('conflict');
      return { ...data, id, version: data.version + 1 };
    },
  };
  const scope = vue.effectScope();
  const unmount = [];
  const exports = {};
  const script =
    parse(editor).descriptor.scriptSetup.content +
    '\nexport { form, formRef, fields, version, savedId, busy, loadFailed, handleSubmit, canLeave, beforeClose, requestClose, adopted };';
  scope.run(() =>
    new Function(
      'require',
      'exports',
      'defineProps',
      'defineEmits',
      'defineModel',
      'window',
      compile(script),
    )(
      (name) => {
        if (name === 'vue')
          return {
            ...vue,
            onMounted: () => {},
            onBeforeUnmount: (callback) => unmount.push(callback),
          };
        if (name === 'vue-router') return { onBeforeRouteLeave: () => {} };
        if (name === 'element-plus')
          return {
            ElMessage: {
              success: (text) => calls.push(['success', text]),
              warning: (text) => calls.push(['warning', text]),
            },
            ElMessageBox: {
              confirm: async () => {
                calls.push(['confirm']);
                if (!state.confirm) throw Error('cancel');
              },
            },
          };
        if (name === '@/api/contentArticle') return api;
        if (name === '@/api/contentTemplate')
          return { getContentTemplates: async () => ({ list: [], total: 0 }) };
        if (name === '@/stores/user')
          return { useUserStore: () => ({ hasPermission: () => true }) };
        if (name === './taskState')
          return {
            isActiveTask: (task) =>
              ['pending', 'running'].includes(task?.status),
          };
        if (name === '@/api/upload')
          return { uploadFile: async () => ({ url: '/uploads/test.png' }) };
        if (name.endsWith('.vue')) return {};
        throw Error(`Unexpected import ${name}`);
      },
      exports,
      () => props,
      () => () => calls.push(['emit']),
      () => visible,
      { addEventListener() {}, removeEventListener() {} },
    ),
  );
  exports.formRef.value = { validate: async () => true };
  return {
    ...exports,
    props,
    visible,
    calls,
    state,
    close: () => {
      unmount.forEach((callback) => callback());
      scope.stop();
    },
  };
}

test('表单仅四字段，打开新记录不调用模型，正文可空保存', async () => {
  const h = harness();
  h.visible.value = true;
  await flush();
  assert.deepEqual(
    h.fields.map((field) => field.prop),
    ['title', 'coverUrl', 'idea', 'content'],
  );
  assert.equal(h.calls.length, 0);
  h.form.title = '先记录';
  h.form.idea = '一些想法';
  await h.handleSubmit();
  assert.deepEqual(h.calls.find((call) => call[0] === 'create')[1], {
    title: '先记录',
    coverUrl: '',
    idea: '一些想法',
    content: '',
    aiConfigId: null,
    templateId: null,
  });
  assert.equal(h.visible.value, false);
  h.close();
});

test('保存冲突时不关闭，仍保留窗口和编辑正文', async () => {
  const h = harness();
  h.props.row = { id: 1 };
  h.visible.value = true;
  await flush();
  h.form.content = '手改正文';
  h.state.saveError = true;
  await h.handleSubmit();
  assert.equal(h.form.content, '手改正文');
  assert.equal(
    h.calls.some((call) => call[0] === 'generate'),
    false,
  );
  assert.equal(h.visible.value, true);
  h.close();
});

test('编辑回显保存的配置/模板，更换后随正文保存，不调用 AI', async () => {
  const h = harness();
  Object.assign(h.state.detail, { aiConfigId: 5, templateId: 8 });
  h.props.row = { id: 1 };
  h.visible.value = true;
  await flush();
  assert.equal(h.form.aiConfigId, 5);
  assert.equal(h.form.templateId, 8);
  h.form.aiConfigId = 9;
  h.form.templateId = null;
  await h.handleSubmit();
  const data = h.calls.find((call) => call[0] === 'update')[2];
  assert.equal(data.aiConfigId, 9);
  assert.equal(data.templateId, null);
  assert.equal(data.version, 4);
  assert.equal(
    h.calls.some((call) => call[0] === 'generate'),
    false,
  );
  h.close();
});

test('未保存关闭需要确认，取消后保留输入', async () => {
  const h = harness();
  h.visible.value = true;
  await flush();
  h.form.title = '未保存';
  h.state.confirm = false;
  await h.requestClose();
  assert.equal(h.visible.value, true);
  assert.equal(h.form.title, '未保存');
  h.state.confirm = true;
  await h.requestClose();
  assert.equal(h.visible.value, false);
  h.close();
});

test('右上角关闭和 Escape 必须先通过 before-close，拒绝时不执行内部关闭', async () => {
  const h = harness();
  h.visible.value = true;
  await flush();
  h.form.title = '未保存';
  let closed = false;
  h.state.confirm = false;
  await h.beforeClose(() => {
    closed = true;
  });
  assert.equal(closed, false);
  assert.equal(h.visible.value, true);
  h.state.confirm = true;
  await h.beforeClose(() => {
    closed = true;
  });
  assert.equal(closed, true);
  assert.equal(h.visible.value, false);
  assert.match(editor, /:before-close="beforeClose"/);
  h.close();
});

test('详情读取失败不允许保存；迟到详情不覆盖新记录', async () => {
  const h = harness();
  let resolve;
  h.state.detail = new Promise((done) => {
    resolve = done;
  });
  h.props.row = { id: 1 };
  h.visible.value = true;
  await flush();
  h.props.row = null;
  await flush();
  h.form.title = '新记录';
  resolve({ title: '旧记录', idea: '', content: '', coverUrl: '', version: 9 });
  await flush();
  assert.equal(h.form.title, '新记录');
  h.state.detail = Promise.reject(Error('not found'));
  h.props.row = { id: 2 };
  await flush();
  assert.equal(h.loadFailed.value, true);
  await h.handleSubmit();
  assert.equal(
    h.calls.some((call) => call[0] === 'update'),
    false,
  );
  h.close();
});

test('创作页面模板与样式可编译，不执行生成 HTML', async () => {
  for (const filename of [
    'Index.vue',
    'Generate.vue',
    'GenerationSettings.vue',
    'Edit.vue',
    'View.vue',
    'Tasks.vue',
    '../content-template/Index.vue',
    '../content-template/Edit.vue',
    '../content-template/View.vue',
    '../ai-config/Index.vue',
  ]) {
    const source = await read(`./${filename}`);
    const parsed = parse(source);
    assert.deepEqual(parsed.errors, []);
    const template = compileTemplate({
      source: parsed.descriptor.template.content,
      filename,
      id: 'article-test',
    });
    assert.deepEqual(template.errors, []);
    for (const style of parsed.descriptor.styles) {
      assert.deepEqual(
        compileStyle({
          source: style.content,
          filename,
          id: 'article-test',
          scoped: true,
        }).errors,
        [],
      );
    }
    assert.doesNotMatch(source, /v-html/);
  }
});
