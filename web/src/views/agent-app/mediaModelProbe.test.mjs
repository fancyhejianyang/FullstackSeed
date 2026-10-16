import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as vue from "vue";

// 执行真实 Edit.vue 的 setup 逻辑和 Vue watchers；只替换网络与 UI 外壳，不发付费请求。
const sfc = await readFile(new URL("./Edit.vue", import.meta.url), "utf8");
const source = sfc.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
const { outputText } = ts.transpileModule(
  source +
    "\nexport { form, options, loading, mediaChecks, rejectedMedia, probeBusy, mediaOptions, refreshMediaOptions, checkMediaModel };",
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const configuration = () => ({
  providers: [
    { id: 2, name: "账号", models: [{ value: "text", text: "text" }] },
  ],
  businessTools: [],
  mediaModels: {
    vision: ["one", "two"].map((model) => ({
      providerId: 2,
      model,
      text: model,
    })),
    imageGeneration: [{ providerId: 2, model: "image", text: "image" }],
  },
});
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function result(input, status = "valid") {
  return {
    ...input,
    status,
    reason: "test",
    message: "测试结果",
    checkedAt: new Date().toISOString(),
    cached: false,
  };
}
function harness(t, { row = null, ...overrides } = {}) {
  const visible = vue.ref(false);
  const requests = [];
  const warnings = [];
  let unmount;
  const api = {
    getAgentConfigurationOptions: async () => configuration(),
    getUsers: async () => ({ list: [] }),
    probeAgentMediaModel: (data) => {
      requests.push(data);
      return Promise.resolve(result(data));
    },
    ...overrides,
  };
  const modules = {
    vue: {
      ...vue,
      onBeforeUnmount: (fn) => {
        unmount = fn;
      },
    },
    "element-plus": {
      ElMessage: { warning: (text) => warnings.push(text), success: () => {} },
    },
    "@/api/agentApp": api,
    "@/api/user": api,
    "@/utils/permission": { getPermissionActionColor: () => "info" },
  };
  const scope = vue.effectScope();
  const exports = {};
  scope.run(() =>
    new Function(
      "require",
      "exports",
      "defineProps",
      "defineEmits",
      "defineModel",
      outputText,
    )(
      (name) => {
        if (name.endsWith(".vue")) return { default: {} };
        if (!modules[name]) throw new Error(`Unexpected import ${name}`);
        return modules[name];
      },
      exports,
      () => ({ row }),
      () => () => {},
      () => visible,
    ),
  );
  t.after(() => {
    unmount();
    scope.stop();
  });
  return {
    ...exports,
    visible,
    requests,
    warnings,
    async open() {
      visible.value = true;
      await tick();
    },
  };
}

test("opening an existing app fills both references without a paid test", async (t) => {
  const h = harness(t, {
    row: { id: 1 },
    getAgentApp: async () => ({
      providerId: 2,
      models: ["text"],
      toolKeys: [],
      accessScope: "all",
      mediaModels: {
        vision: { providerId: 2, model: "one" },
        imageGeneration: { providerId: 2, model: "image" },
      },
    }),
  });
  await h.open();
  assert.equal(h.form.visionModel, "2:one");
  assert.equal(h.form.imageGenerationModel, "2:image");
  assert.equal(h.requests.length, 0);
});

test("manual selection tests once and preserves a verified selection", async (t) => {
  const h = harness(t);
  await h.open();
  h.form.visionModel = "2:one";
  assert.equal(h.probeBusy.value, true);
  await tick();
  assert.deepEqual(h.requests, [
    { providerId: 2, model: "one", kind: "vision" },
  ]);
  assert.equal(h.mediaChecks.vision.status, "valid");
  assert.equal(h.form.visionModel, "2:one");
  assert.equal(h.probeBusy.value, false);
});

test("definite failure removes just this capability candidate and leaves account options untouched", async (t) => {
  const h = harness(t, {
    probeAgentMediaModel: async (data) => result(data, "invalid"),
  });
  await h.open();
  h.form.visionModel = "2:one";
  await tick();
  assert.equal(h.form.visionModel, "");
  assert.equal(h.mediaChecks.vision.status, "invalid");
  assert.equal(h.mediaOptions("vision", "").length, 1);
  assert.equal(h.options.value.mediaModels.vision.length, 2);
  assert.equal(h.mediaOptions("imageGeneration", "").length, 1);
  assert.equal(h.warnings.length, 1);
  await h.refreshMediaOptions();
  assert.equal(h.mediaOptions("vision", "").length, 2);
  assert.equal(h.rejectedMedia.size, 0);
});

test("inconclusive or network failures retain the selected candidate", async (t) => {
  for (const probeAgentMediaModel of [
    async (data) => result(data, "inconclusive"),
    async () => {
      throw new Error("network");
    },
  ]) {
    const h = harness(t, { probeAgentMediaModel });
    await h.open();
    h.form.imageGenerationModel = "2:image";
    await tick();
    assert.equal(h.form.imageGenerationModel, "2:image");
    assert.equal(h.mediaChecks.imageGeneration.status, "inconclusive");
    assert.equal(h.rejectedMedia.size, 0);
  }
});

test("a late result cannot clear a newer selection or close/reopened dialog", async (t) => {
  const pending = [];
  const h = harness(t, {
    probeAgentMediaModel: (data) => {
      const d = deferred();
      pending.push({ ...d, data });
      return d.promise;
    },
  });
  await h.open();
  h.form.visionModel = "2:one";
  h.form.visionModel = "2:two";
  pending[0].resolve(result(pending[0].data, "invalid"));
  await tick();
  assert.equal(h.form.visionModel, "2:two");
  assert.equal(h.rejectedMedia.size, 0);
  assert.equal(h.probeBusy.value, true);
  h.visible.value = false;
  await h.open();
  pending[1].resolve(result(pending[1].data, "invalid"));
  await tick();
  assert.equal(h.rejectedMedia.size, 0);
  assert.equal(h.mediaChecks.vision, undefined);
  assert.equal(h.probeBusy.value, false);
});

test("changing accounts invalidates pending results without deleting another account's candidates", async (t) => {
  const pending = deferred();
  const h = harness(t, { probeAgentMediaModel: () => pending.promise });
  await h.open();
  h.form.visionModel = "2:one";
  h.form.providerId = 3;
  pending.resolve(
    result({ providerId: 2, model: "one", kind: "vision" }, "invalid"),
  );
  await tick();
  assert.equal(h.form.visionModel, "");
  assert.equal(h.form.imageGenerationModel, "");
  assert.equal(h.rejectedMedia.size, 0);
  assert.equal(h.probeBusy.value, false);
});

test("stale initial config response cannot overwrite a reopened form or trigger probing", async (t) => {
  const first = deferred();
  let calls = 0;
  const h = harness(t, {
    getAgentConfigurationOptions: () =>
      ++calls === 1 ? first.promise : Promise.resolve(configuration()),
  });
  h.visible.value = true;
  h.visible.value = false;
  await h.open();
  h.form.name = "刚编辑的名称";
  first.resolve(configuration());
  await tick();
  assert.equal(h.form.name, "刚编辑的名称");
  assert.equal(h.requests.length, 0);
  assert.equal(h.loading.value, false);
});

test("refresh failure preserves rejected candidates until a successful refresh", async (t) => {
  let calls = 0;
  const h = harness(t, {
    getAgentConfigurationOptions: () =>
      ++calls === 1
        ? Promise.resolve(configuration())
        : Promise.reject(new Error("network")),
    probeAgentMediaModel: async (data) => result(data, "invalid"),
  });
  await h.open();
  h.form.visionModel = "2:one";
  await tick();
  await h.refreshMediaOptions();
  assert.equal(h.rejectedMedia.size, 1);
  assert.equal(h.probeBusy.value, false);
});
