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
    result: { content: 'AI 正文' },
    confirm: true,
    saveError: false,
  };
  const api = {
    getContentArticle: async (id) => {
      calls.push(['detail', id]);
      return await state.detail;
    },
    generateContentArticle: async (data, id) => {
      calls.push(['generate', data, id]);
      return await state.result;
    },
    createContentArticle: async (data) => {
      calls.push(['create', data]);
      if (state.saveError) throw Error('save failed');
    },
    updateContentArticle: async (id, data) => {
      calls.push(['update', id, data]);
      if (state.saveError) throw Error('conflict');
    },
  };
  const scope = vue.effectScope();
  const unmount = [];
  const exports = {};
  const script =
    parse(editor).descriptor.scriptSetup.content +
    '\nexport { form, formRef, fields, version, candidate, generating, busy, loadFailed, generate, adopt, handleSubmit, canLeave, beforeClose, requestClose };';
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
  });
  assert.equal(h.visible.value, false);
  h.close();
});

test('生成只发送当前标题和想法，采用前原文不变、不自动保存', async () => {
  const h = harness();
  h.props.row = { id: 1 };
  h.visible.value = true;
  await flush();
  await h.generate();
  assert.equal(h.form.content, '原文');
  assert.equal(h.candidate.value, 'AI 正文');
  assert.deepEqual(
    h.calls.find((call) => call[0] === 'generate'),
    ['generate', { title: '旧标题', idea: '原始想法' }, 1],
  );
  await h.handleSubmit();
  assert.equal(
    h.calls.some((call) => call[0] === 'update'),
    false,
  );
  h.adopt();
  assert.equal(h.form.content, 'AI 正文');
  await h.handleSubmit();
  assert.equal(h.calls.find((call) => call[0] === 'update')[2].version, 4);
  assert.match(editor, /:confirm="!!form.content.trim\(\)"/);
  h.close();
});

test('生成失败、保存冲突都保留现有正文与窗口', async () => {
  const h = harness();
  h.props.row = { id: 1 };
  h.visible.value = true;
  await flush();
  h.state.result = Promise.reject(Error('failed'));
  await h.generate();
  assert.equal(h.form.content, '原文');
  assert.equal(h.candidate.value, '');
  assert.equal(h.generating.value, false);
  h.state.saveError = true;
  await h.handleSubmit();
  assert.equal(h.visible.value, true);
  assert.equal(h.form.content, '原文');
  h.close();
});

test('空想法不触发模型；进行中禁重复调用与关闭', async () => {
  const h = harness();
  h.visible.value = true;
  await flush();
  h.form.title = '标题';
  await h.generate();
  assert.equal(
    h.calls.some((call) => call[0] === 'generate'),
    false,
  );
  let resolve;
  h.state.result = new Promise((done) => {
    resolve = done;
  });
  h.form.idea = '想法';
  const pending = h.generate();
  const duplicate = h.generate();
  await flush();
  await duplicate;
  await h.generate();
  assert.equal(h.calls.filter((call) => call[0] === 'generate').length, 1);
  assert.equal(await h.canLeave(), false);
  resolve({ content: '完成' });
  await pending;
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

test('卸载后的生成响应不会写入表单', async () => {
  const h = harness();
  h.visible.value = true;
  await flush();
  h.form.title = '标题';
  h.form.idea = '想法';
  let resolve;
  h.state.result = new Promise((done) => {
    resolve = done;
  });
  const pending = h.generate();
  await flush();
  h.close();
  resolve({ content: '迟到结果' });
  await pending;
  assert.equal(h.candidate.value, '');
});

test('三个页面模板与样式可编译，不执行生成 HTML', async () => {
  for (const filename of ['Index.vue', 'Edit.vue', 'View.vue']) {
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
