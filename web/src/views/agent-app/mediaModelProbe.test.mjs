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
    "\nexport { form, options, loading, mediaChecks, rejectedMedia, probeBusy, mediaOptions, refreshMediaOptions, checkMediaModel, imageGenerationCatalogHint, canProbeMedia, handleSubmit };",
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
    axios: { isAxiosError: (error) => error?.isAxiosError === true },
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

test("registered image models stay visible with endpoint reasons and remain scoped to the account", async (t) => {
  const config = configuration();
  config.mediaModels.imageGeneration = [
    {
      providerId: 2,
      model: "ready",
      text: "可用模型",
      available: true,
      unavailableReason: null,
    },
    {
      providerId: 2,
      model: "missing",
      text: "待配置模型",
      available: false,
      unavailableReason: "未配置文生图接口",
    },
    {
      providerId: 2,
      model: "disabled",
      text: "停用模型",
      available: false,
      unavailableReason: "文生图接口已停用",
    },
    {
      providerId: 3,
      model: "other",
      text: "其它账号模型",
      available: true,
      unavailableReason: null,
    },
  ];
  const h = harness(t, { getAgentConfigurationOptions: async () => config });
  await h.open();
  const choices = h.mediaOptions("imageGeneration", "");
  assert.deepEqual(
    choices.map((item) => item.value),
    ["2:ready", "2:missing", "2:disabled"],
  );
  assert.deepEqual(
    choices.map((item) => item.disabled),
    [false, true, true],
  );
  assert.match(choices[1].label, /未配置文生图接口/);
  assert.match(choices[2].label, /已停用/);
  assert.match(
    h.imageGenerationCatalogHint.value,
    /已登记 3 个生图模型，当前可选 1 个/,
  );
  assert.match(
    h.imageGenerationCatalogHint.value,
    /第三方配置 → 模型厂商调用接口/,
  );
  assert.equal(h.requests.length, 0);
});

test("saved unavailable image reference is retained and blocks testing and saving until refreshed", async (t) => {
  const config = configuration();
  config.mediaModels.imageGeneration[0].available = false;
  config.mediaModels.imageGeneration[0].unavailableReason = "文生图接口已停用";
  const saves = [];
  const h = harness(t, {
    row: { id: 1 },
    getAgentConfigurationOptions: async () => structuredClone(config),
    getAgentApp: async () => ({
      providerId: 2,
      models: ["text"],
      toolKeys: [],
      accessScope: "all",
      mediaModels: {
        vision: null,
        imageGeneration: { providerId: 2, model: "image" },
      },
    }),
    updateAgentApp: async (...args) => {
      saves.push(args);
    },
  });
  await h.open();
  assert.equal(h.form.imageGenerationModel, "2:image");
  assert.equal(h.mediaOptions("imageGeneration", "2:image")[0].disabled, true);
  assert.equal(h.canProbeMedia("imageGeneration"), false);
  await h.checkMediaModel("imageGeneration");
  await h.handleSubmit();
  assert.equal(h.requests.length, 0);
  assert.equal(saves.length, 0);
  assert.match(h.warnings.join(" "), /文生图接口已停用/);

  config.mediaModels.imageGeneration[0].available = true;
  config.mediaModels.imageGeneration[0].unavailableReason = null;
  await h.refreshMediaOptions();
  assert.equal(h.canProbeMedia("imageGeneration"), true);
  assert.equal(h.form.imageGenerationModel, "2:image");
  assert.equal(h.requests.length, 0);
});

test("empty catalog and locally rejected image models have different guidance", async (t) => {
  const h = harness(t, {
    probeAgentMediaModel: async (data) => result(data, "invalid"),
  });
  await h.open();
  h.form.imageGenerationModel = "2:image";
  await tick();
  assert.match(
    h.imageGenerationCatalogHint.value,
    /已登记 1 个生图模型，当前可选 0 个/,
  );
  assert.doesNotMatch(h.imageGenerationCatalogHint.value, /尚未填写/);
  h.options.value.mediaModels.imageGeneration = [];
  assert.match(h.imageGenerationCatalogHint.value, /尚未填写有效的生图模型/);
});
