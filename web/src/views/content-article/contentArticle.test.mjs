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
    '\nexport { form, formRef, fields, version, savedId, revision, activeTask, generating, busy, loadFailed, generate, handleSubmit, canLeave, beforeClose, requestClose, adopted, templateId };';
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
  });
  assert.equal(h.visible.value, false);
  h.close();
});

test('保存后提交后台任务，原文不被覆盖，任务运行不阻止关闭', async () => {
  const h = harness();
  h.props.row = { id: 1 };
  h.visible.value = true;
  await flush();
  h.form.idea = '新想法';
  h.templateId.value = '8';
  await h.generate();
  assert.equal(h.form.content, '原文');
  const update = h.calls.find((call) => call[0] === 'update');
  const generate = h.calls.find((call) => call[0] === 'generate');
  assert.equal(update[2].idea, '新想法');
  assert.equal(generate[1], 1);
  assert.equal(generate[2].version, 5);
  assert.equal(generate[2].templateId, 8);
  assert.match(generate[2].requestId, /^[0-9a-f-]{36}$/);
  assert.ok(h.calls.indexOf(update) < h.calls.indexOf(generate));
  assert.equal(h.activeTask.value, true);
  assert.equal(await h.canLeave(), true);
  assert.equal(h.generating.value, false);
  await h.requestClose();
  assert.equal(h.visible.value, false);
  h.close();
});

test('提交响应失败后保留草稿 ID 与请求号，重试不会重复创建文章', async () => {
  const h = harness();
  h.visible.value = true;
  await flush();
  h.form.title = '标题';
  h.form.idea = '想法';
  h.state.result = Promise.reject(Error('network'));
  await h.generate();
  const first = h.calls.find((call) => call[0] === 'generate');
  assert.equal(h.savedId.value, 1);
  h.state.result = { id: 20, status: 'pending' };
  await h.generate();
  assert.equal(h.calls.filter((call) => call[0] === 'create').length, 1);
  const requests = h.calls.filter((call) => call[0] === 'generate');
  assert.equal(requests.length, 2);
  assert.equal(requests[1][2].requestId, first[2].requestId);
  h.close();
});

test('保存冲突时不提交任务，仍保留窗口和编辑正文', async () => {
  const h = harness();
  h.props.row = { id: 1 };
  h.visible.value = true;
  await flush();
  h.form.content = '手改正文';
  h.state.saveError = true;
  await h.generate();
  assert.equal(h.form.content, '手改正文');
  assert.equal(
    h.calls.some((call) => call[0] === 'generate'),
    false,
  );
  assert.equal(h.visible.value, true);
  assert.equal(h.generating.value, false);
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
  resolve({ id: 20, status: 'pending' });
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
  resolve({ id: 20, status: 'pending' });
  await pending;
  assert.equal(h.revision.value, 0);
});

test('三个页面模板与样式可编译，不执行生成 HTML', async () => {
  for (const filename of [
    'Index.vue',
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
