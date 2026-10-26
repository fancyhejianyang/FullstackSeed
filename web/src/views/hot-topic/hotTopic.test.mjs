import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import * as vue from "vue";
import { parse, compileTemplate } from "@vue/compiler-sfc";
import ts from "typescript";
import { formatDateTime } from "../../utils/format.ts";
import {
  readCookieFile,
  validateCookieFile,
} from "../hot-topic-source/cookieFile.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const apiSource = await read("../../api/hotTopic.ts");
const apiCode = ts.transpileModule(
  apiSource.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const api = new Function(
  "request",
  `${apiCode}; return {safeSourceUrl, activeRun, NETEASE_NEWS_API_URL, sourceKindLabels};`,
)({});
const fixedSourcesCode = ts.transpileModule(
  (await read("../../api/hotTopicSources.ts"))
    .replace(/^import[\s\S]*?;\r?\n/gm, "")
    .replace(/^export /gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const fixedSources = new Function(
  ...Object.keys(api),
  `${fixedSourcesCode}; return {DOUYIN_HOT_API_URL, fixedHotSourceUrl};`,
)(...Object.values(api));
const preferenceCode = ts.transpileModule(
  (await read("./preferenceValidation.ts"))
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/^export /gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const preferenceFunctions = new Function(
  ...Object.keys(fixedSources),
  `${preferenceCode}; return {scheduleValidationError};`,
)(...Object.values(fixedSources));
const validateSchedule = preferenceFunctions.scheduleValidationError;
const files = [
  "Index.vue",
  "Preferences.vue",
  "View.vue",
  "Runs.vue",
  "CreateArticle.vue",
  "../hot-topic-source/Index.vue",
  "../hot-topic-source/Edit.vue",
  "../hot-topic-source/View.vue",
];
const sources = new Map(
  await Promise.all(files.map(async (name) => [name, await read(`./${name}`)])),
);

test("来源外链仅允许无凭据 HTTPS，禁止脚本和非安全协议", () => {
  assert.equal(
    api.safeSourceUrl("https://www.douyin.com/user/123"),
    "https://www.douyin.com/user/123",
  );
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "http://example.com",
    "https://name:password@example.com",
    "invalid",
  ])
    assert.equal(api.safeSourceUrl(value), "");
});

test("只有待执行和执行中的状态持续轮询", () => {
  assert.equal(api.activeRun("pending"), true);
  assert.equal(api.activeRun("running"), true);
  for (const status of [
    "succeeded",
    "partial",
    "failed",
    "interrupted",
    "unknown",
  ])
    assert.equal(api.activeRun(status), false);
});

test("所有新页面模板可编译，来源与模型内容只以转义文本渲染", () => {
  for (const [name, source] of sources) {
    const { descriptor, errors } = parse(source);
    assert.deepEqual(errors, [], name);
    const result = compileTemplate({
      source: descriptor.template.content,
      filename: name,
      id: name,
      compilerOptions: { expressionPlugins: ["typescript"] },
    });
    assert.deepEqual(result.errors, [], name);
    assert.doesNotMatch(source, /v-html|innerHTML|eval\(/, name);
  }
});

test("手动发起、计划默认关闭、创建后是否生成须明确选择", () => {
  assert.match(sources.get("Preferences.vue"), /scheduleEnabled: false/);
  assert.match(
    sources.get("Preferences.vue"),
    /scheduleEnabled: Boolean\(form\.scheduleEnabled\)/,
  );
  assert.match(
    sources.get("Preferences.vue"),
    /scheduleEnabled: Boolean\(saved\.scheduleEnabled\)/,
  );
  assert.match(sources.get("Preferences.vue"), /ElMessageBox\.confirm/);
  assert.match(sources.get("CreateArticle.vue"), /generate: false/);
  assert.match(sources.get("Index.vue"), /@click="run\('discover'\)"/);
  assert.match(sources.get("Index.vue"), /perm="HotTopic.create"/);
  assert.doesNotMatch(sources.get("Index.vue"), /onMounted\(/);
  assert.doesNotMatch(sources.get("Index.vue"), /收藏|saved/);
  assert.match(sources.get("Index.vue"), /:action-width="180"/);
  assert.match(
    sources.get("Index.vue"),
    /:icon="row\.decision === 'ignored' \? 'RefreshLeft' : 'Hide'"/,
  );
  assert.match(sources.get("Index.vue"), /:aria-label=/);
  assert.doesNotMatch(
    sources.get("Index.vue"),
    />\{\{ row\.decision === 'ignored' \? '恢复' : '忽略' \}\}<\/Button/,
  );
});

test("固定接口保留且来源页面不再提供获取方式，所有来源自动采集", () => {
  const source = sources.get("../hot-topic-source/Edit.vue");
  assert.equal(
    fixedSources.DOUYIN_HOT_API_URL,
    "https://www.douyin.com/aweme/v1/web/hot/search/list/",
  );
  assert.equal(
    fixedSources.fixedHotSourceUrl("douyinHot"),
    fixedSources.DOUYIN_HOT_API_URL,
  );
  assert.equal(
    fixedSources.fixedHotSourceUrl("neteaseNews"),
    api.NETEASE_NEWS_API_URL,
  );
  assert.equal(fixedSources.fixedHotSourceUrl("weiboHot"), null);
  assert.match(source, /来源接口（固定）/);
  assert.match(source, /data\.word_list/);
  assert.doesNotMatch(
    source,
    /douyinAccount|rss|jsonFeed|apiToken|clearApiToken/,
  );
  for (const filename of [
    "../hot-topic-source/Edit.vue",
    "../hot-topic-source/Index.vue",
    "../hot-topic-source/View.vue",
  ])
    assert.doesNotMatch(
      sources.get(filename),
      /accessMode|sourceAccessLabels|hotSourceAccessLabel/,
    );
  assert.doesNotMatch(
    apiSource,
    /HotTopicMode|modeLabels|HotSourceAccess|sourceAccessLabels|webSearchMode/,
  );
});

test("记录窗口先展示当前任务详情，再展示历史任务表格", () => {
  const source = sources.get("Runs.vue");
  assert.ok(source.indexOf('class="run-detail"') < source.indexOf("<Table"));
});

test("来源回填归一化抖音网易，微博正常回显，切换固定来源与提交均保持唯一地址", async () => {
  const visible = vue.ref(true);
  const props = { row: { id: 1 } };
  let record = {
    name: "网易国内新闻",
    kind: "neteaseNews",
    accessMode: "search",
    url: "https://old.example.com",
    isEnabled: true,
    description: "",
  };
  const raw = parse(
    sources.get("../hot-topic-source/Edit.vue"),
  ).descriptor.scriptSetup.content.replace(/^import[\s\S]*?;\r?\n/gm, "");
  const script = ts.transpileModule(raw, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const saved = [];
  let reads = 0;
  const context = {
    computed: vue.computed,
    reactive: vue.reactive,
    ref: vue.ref,
    shallowRef: vue.shallowRef,
    watch: vue.watch,
    onBeforeUnmount: () => {},
    defineModel: () => visible,
    defineProps: () => props,
    defineEmits: () => () => {},
    useSubmissionGuard: () => {},
    getHotSource: async () => {
      reads++;
      return record;
    },
    createHotSource: async (data) => {
      saved.push(data);
    },
    updateHotSource: async (_id, data) => {
      saved.push(data);
    },
    ElMessage: { success: () => {}, error: () => {} },
    formatDateTime,
    readCookieFile,
    validateCookieFile,
    ...api,
    ...fixedSources,
  };
  const scope = vue.effectScope();
  const h = scope.run(() =>
    new Function(
      ...Object.keys(context),
      `${script}; return {form, fields, load, submit, formRef};`,
    )(...Object.values(context)),
  );
  try {
    await h.load();
    assert.equal(h.form.url, api.NETEASE_NEWS_API_URL);
    assert.equal(h.form.accessMode, undefined);
    assert.equal(
      h.fields.value.find((field) => field.prop === "url").componentProps
        .readonly,
      true,
    );
    assert.equal(
      h.fields.value.some((field) => field.prop === "accessMode"),
      false,
    );
    record = {
      ...record,
      kind: "douyinHot",
      url: "https://old.example.com/hot",
    };
    await h.load();
    assert.equal(h.form.url, fixedSources.DOUYIN_HOT_API_URL);
    assert.equal(h.form.accessMode, undefined);
    assert.equal(
      h.fields.value.some((field) => field.prop === "accessMode"),
      false,
    );
    assert.equal(saved.length, 0);
    record = {
      ...record,
      name: "微博热点",
      kind: "weiboHot",
      accessMode: "search",
      url: "https://example.com/hot",
    };
    await h.load();
    await vue.nextTick();
    assert.equal(h.form.url, record.url);
    assert.equal(h.form.accessMode, undefined);
    h.form.kind = "neteaseNews";
    assert.equal(h.form.url, api.NETEASE_NEWS_API_URL);
    h.form.kind = "douyinHot";
    assert.equal(h.form.url, fixedSources.DOUYIN_HOT_API_URL);
    assert.equal(h.form.accessMode, undefined);
    h.form.url = "https://tampered.example.com/hot";
    await h.submit();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].url, fixedSources.DOUYIN_HOT_API_URL);
    assert.equal("accessMode" in saved[0], false);
    h.form.kind = "weiboHot";
    assert.equal(h.form.url, "");
    assert.equal(
      h.fields.value.find((field) => field.prop === "url").componentProps,
      undefined,
    );
    assert.equal(
      h.fields.value.some((field) => field.prop === "accessMode"),
      false,
    );
    props.row = null;
    const previousReads = reads;
    await h.load();
    assert.equal(reads, previousReads);
    assert.equal(h.form.kind, "douyinHot");
    assert.equal(h.form.url, fixedSources.DOUYIN_HOT_API_URL);
    assert.equal(h.form.accessMode, undefined);
    assert.equal(saved.length, 1);
  } finally {
    scope.stop();
  }
});

function sourceEditorHarness(overrides = {}) {
  const visible = vue.ref(true);
  const props = vue.reactive({ row: { id: 1 } });
  const saved = [],
    messages = [],
    unmount = [];
  const record = {
    id: 1,
    name: "抖音热点",
    kind: "douyinHot",
    url: fixedSources.DOUYIN_HOT_API_URL,
    isEnabled: true,
    description: "",
    hasCookie: true,
    cookieUpdatedAt: "2026-10-26T01:02:03Z",
    ...overrides.record,
  };
  const raw = parse(
    sources.get("../hot-topic-source/Edit.vue"),
  ).descriptor.scriptSetup.content.replace(/^import[\s\S]*?;\r?\n/gm, "");
  const script = ts.transpileModule(raw, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    computed: vue.computed,
    reactive: vue.reactive,
    ref: vue.ref,
    shallowRef: vue.shallowRef,
    watch: vue.watch,
    onBeforeUnmount: (callback) => unmount.push(callback),
    defineModel: () => visible,
    defineProps: () => props,
    defineEmits: () => () => {},
    useSubmissionGuard: () => {},
    getHotSource: async () => record,
    createHotSource: async (data) => saved.push(structuredClone(data)),
    updateHotSource: async (id, data) =>
      saved.push({ id, ...structuredClone(data) }),
    ElMessage: {
      success: (message) => messages.push({ type: "success", message }),
      error: (message) => messages.push({ type: "error", message }),
    },
    formatDateTime,
    readCookieFile,
    validateCookieFile,
    ...api,
    ...fixedSources,
    ...overrides.context,
  };
  const scope = vue.effectScope();
  const h = scope.run(() =>
    new Function(
      ...Object.keys(context),
      `${script}; return {form, fields, load, submit, close, formRef, cookieFile, cookieError, cookieStatus, savedHasCookie, savedCookieUpdatedAt, clearCookie, chooseCookieFile, markCookieCleared, resetCookieSelection};`,
    )(...Object.values(context)),
  );
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    unmount.forEach((callback) => callback());
    scope.stop();
  };
  return { ...h, visible, props, record, saved, messages, dispose };
}

function cookieFileFixture(
  name = "cookies.txt",
  content = "# Netscape HTTP Cookie File\n.douyin.com\tTRUE\t/\tTRUE\t0\tsession\ttest-only",
) {
  const bytes = new TextEncoder().encode(content);
  let reads = 0;
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () => {
      reads++;
      return bytes.buffer;
    },
    reads: () => reads,
    content,
  };
}
const chooseCookie = (h, file) =>
  h.chooseCookieFile({ target: { files: [file], value: "local-selection" } });

test("抖音 Cookie 仅本地选择；取消、切来源和卸载释放文件且不提交", async () => {
  const h = sourceEditorHarness();
  try {
    await h.load();
    assert.ok(h.fields.value.some((field) => field.prop === "cookieFile"));
    assert.match(h.cookieStatus.value, /已配置.*更新于/);
    const file = cookieFileFixture();
    chooseCookie(h, file);
    assert.equal(h.cookieFile.value, file);
    assert.equal(file.reads(), 0);
    assert.equal(h.saved.length, 0);
    h.close();
    await vue.nextTick();
    assert.equal(h.cookieFile.value, null);
    assert.equal(h.savedHasCookie.value, false);
    assert.equal(h.saved.length, 0);
    h.visible.value = true;
    await vue.nextTick();
    await h.load();
    chooseCookie(h, file);
    h.form.kind = "weiboHot";
    assert.equal(h.cookieFile.value, null);
    assert.equal(
      h.fields.value.some((field) => field.prop === "cookieFile"),
      false,
    );
    h.form.kind = "douyinHot";
    chooseCookie(h, file);
    h.dispose();
    assert.equal(h.cookieFile.value, null);
    assert.equal(file.reads(), 0);
    assert.equal(h.saved.length, 0);
  } finally {
    h.dispose();
  }
});

test("替换文件只在保存时读取最新选择，清除须保存才提交且不携带旧内容", async () => {
  const h = sourceEditorHarness();
  try {
    await h.load();
    const oldFile = cookieFileFixture("old.txt");
    const nextFile = cookieFileFixture(
      "replacement.txt",
      ".douyin.com\tTRUE\t/\tTRUE\t0\tsession\treplacement-test-only",
    );
    chooseCookie(h, oldFile);
    chooseCookie(h, nextFile);
    assert.equal(oldFile.reads(), 0);
    assert.equal(nextFile.reads(), 0);
    await h.submit();
    assert.equal(h.saved.length, 1);
    assert.equal(oldFile.reads(), 0);
    assert.equal(nextFile.reads(), 1);
    assert.equal(h.saved[0].cookieFileName, "replacement.txt");
    assert.equal(h.saved[0].cookieFileContent, nextFile.content);
    assert.equal("clearCookie" in h.saved[0], false);
  } finally {
    h.dispose();
  }
  const clear = sourceEditorHarness();
  try {
    await clear.load();
    clear.markCookieCleared();
    assert.equal(clear.clearCookie.value, true);
    assert.match(clear.cookieStatus.value, /保存配置后生效/);
    assert.equal(clear.saved.length, 0);
    clear.resetCookieSelection();
    assert.equal(clear.clearCookie.value, false);
    assert.match(clear.cookieStatus.value, /已配置/);
    clear.markCookieCleared();
    await clear.submit();
    assert.equal(clear.saved.length, 1);
    assert.equal(clear.saved[0].clearCookie, true);
    assert.equal("cookieFileName" in clear.saved[0], false);
    assert.equal("cookieFileContent" in clear.saved[0], false);
  } finally {
    clear.dispose();
  }
});

test("错误文件阻止保存，可撤销；其它来源不提交 Cookie 字段", async () => {
  const h = sourceEditorHarness();
  try {
    await h.load();
    chooseCookie(h, cookieFileFixture("invalid.json"));
    await h.submit();
    assert.equal(h.saved.length, 0);
    assert.match(h.messages.at(-1).message, /\.txt/);
    h.resetCookieSelection();
    assert.equal(h.cookieError.value, "");
    chooseCookie(h, cookieFileFixture());
    h.form.kind = "neteaseNews";
    await h.submit();
    assert.equal(h.saved.length, 1);
    assert.equal("cookieFileName" in h.saved[0], false);
    assert.equal("cookieFileContent" in h.saved[0], false);
    assert.equal("clearCookie" in h.saved[0], false);
  } finally {
    h.dispose();
  }
});

test("保存中禁止普通关闭；强制关闭或卸载后迟到文件读取不发请求或提示", async () => {
  for (const exit of ["close", "unmount"]) {
    const h = sourceEditorHarness();
    let resolveRead;
    const bytes = new TextEncoder().encode(cookieFileFixture().content);
    let started = false;
    try {
      await h.load();
      chooseCookie(h, {
        name: "cookies.txt",
        size: bytes.byteLength,
        arrayBuffer: () => {
          started = true;
          return new Promise((resolve) => {
            resolveRead = resolve;
          });
        },
      });
      const submission = h.submit();
      await Promise.resolve();
      assert.equal(started, true);
      h.close();
      assert.equal(h.visible.value, true);
      if (exit === "close") {
        h.visible.value = false;
        await vue.nextTick();
      } else h.dispose();
      assert.equal(h.cookieFile.value, null);
      resolveRead(bytes.buffer);
      await submission;
      assert.equal(h.saved.length, 0);
      assert.deepEqual(h.messages, []);
    } finally {
      h.dispose();
    }
  }
});

test("偏好只保留结果偏好，不展示或提交历史模式与联网协议", async () => {
  const visible = vue.ref(true),
    saved = [];
  let requests = 0;
  const raw = parse(
    sources.get("Preferences.vue"),
  ).descriptor.scriptSetup.content.replace(/^import[\s\S]*?;\r?\n/gm, "");
  const script = ts.transpileModule(raw, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    computed: vue.computed,
    reactive: vue.reactive,
    ref: vue.ref,
    watch: vue.watch,
    onBeforeUnmount() {},
    defineModel: () => visible,
    defineEmits: () => () => {},
    useSubmissionGuard() {},
    useUserStore: () => ({ hasPermission: () => true }),
    getHotPreference: async () => {
      requests++;
      return {
        mode: "aiSearch",
        aiConfigId: 9,
        sourceIds: [1, 3],
        interests: "",
        exclusions: "",
        audience: "",
        writingStyle: "",
        lookbackHours: 24,
        maxResults: 10,
        scheduleEnabled: false,
        scheduleTime: "09:00",
      };
    },
    getHotOptions: async () => {
      requests++;
      return {
        aiConfigs: [
          {
            id: 9,
            name: "普通推荐",
            model: "shared-text",
            webSearchMode: "disabled",
          },
        ],
        sources: [
          { id: 1, name: "抖音热点", kind: "douyinHot", accessMode: "search" },
          { id: 3, name: "微博热点", kind: "weiboHot", accessMode: "page" },
        ],
      };
    },
    saveHotPreference: async (payload) => saved.push(payload),
    ElMessage: { success() {}, warning() {} },
    ElMessageBox: { confirm: async () => {} },
    ...preferenceFunctions,
  };
  const scope = vue.effectScope();
  const h = scope.run(() =>
    new Function(
      ...Object.keys(context),
      script + "; return {form, options, sourceOptions, fields, load, submit};",
    )(...Object.values(context)),
  );
  try {
    await h.load();
    assert.equal(requests, 2);
    assert.equal("mode" in h.form, false);
    assert.deepEqual(
      h.sourceOptions.value.map((item) => item.label),
      ["抖音热点", "微博热点"],
    );
    assert.equal(
      h.fields.value.some((field) => field.prop === "mode"),
      false,
    );
    assert.deepEqual(
      vue
        .unref(
          h.fields.value.find((field) => field.prop === "aiConfigId").options,
        )
        .map((item) => item.label),
      ["普通推荐 · shared-text"],
    );
    h.form.mode = "hybrid";
    await h.submit();
    assert.equal(saved.length, 1);
    assert.equal("mode" in saved[0], false);
    assert.equal("webSearchMode" in saved[0], false);
  } finally {
    scope.stop();
  }
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await vue.nextTick();
}

function runsHarness(getHotRun) {
  const visible = vue.ref(false),
    timers = new Map();
  let timerId = 0;
  const scope = vue.effectScope();
  const raw = parse(
    sources.get("Runs.vue"),
  ).descriptor.scriptSetup.content.replace(/^import[\s\S]*?;\r?\n/gm, "");
  const script = ts.transpileModule(raw, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    ref: vue.ref,
    watch: vue.watch,
    onBeforeUnmount: () => {},
    defineModel: () => visible,
    defineProps: () => ({ runId: null }),
    defineEmits: () => () => {},
    getHotRun,
    getHotRuns: async () => ({ list: [], total: 0 }),
    activeRun: api.activeRun,
    setTimeout: (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const state = scope.run(() =>
    new Function(
      ...Object.keys(context),
      `${script}; return {loadDetail, detail, detailFailed, stop};`,
    )(...Object.values(context)),
  );
  return {
    ...state,
    visible,
    timers,
    dispose: () => {
      state.stop();
      scope.stop();
    },
  };
}

test("关闭记录窗口后迟到响应不能恢复详情或启动轮询", async () => {
  const request = deferred();
  const h = runsHarness(() => request.promise);
  h.visible.value = true;
  await flush();
  const loading = h.loadDetail(4);
  h.visible.value = false;
  await flush();
  request.resolve({ id: 4, status: "running" });
  await loading;
  assert.equal(h.detail.value, null);
  assert.equal(h.timers.size, 0);
  h.dispose();
});

test("切换任务时旧响应不能覆盖新任务，终态不创建轮询计时器", async () => {
  const oldRequest = deferred();
  const h = runsHarness((id) =>
    id === 1
      ? oldRequest.promise
      : Promise.resolve({ id: 2, status: "succeeded" }),
  );
  h.visible.value = true;
  await flush();
  const old = h.loadDetail(1);
  await h.loadDetail(2);
  oldRequest.resolve({ id: 1, status: "running" });
  await old;
  assert.equal(h.detail.value.id, 2);
  assert.equal(h.timers.size, 0);
  h.dispose();
});

test("任务读取失败清空旧详情，不自动重试收费执行接口", async () => {
  let failed = false;
  const h = runsHarness(async () => {
    if (failed) throw Error("network");
    return { id: 1, status: "running" };
  });
  h.visible.value = true;
  await flush();
  await h.loadDetail(1);
  assert.equal(h.timers.size, 1);
  failed = true;
  await h.loadDetail(1);
  assert.equal(h.detail.value, null);
  assert.equal(h.detailFailed.value, true);
  assert.equal(h.timers.size, 0);
  h.dispose();
});

test("失效来源和模型仍允许关闭计划；默认来源与可选AI不要求采集模式", () => {
  assert.equal(
    validateSchedule(
      { aiConfigId: 9, sourceIds: [4], scheduleEnabled: false },
      { aiConfigs: [], sources: [] },
      false,
    ),
    null,
  );
  assert.equal(
    validateSchedule(
      { aiConfigId: null, sourceIds: [], scheduleEnabled: true },
      { aiConfigs: [], sources: [] },
      true,
    ),
    null,
  );
});

test("计划只校验执行权限、有效来源、有效可选AI与来源数量", () => {
  const preference = { aiConfigId: 9, sourceIds: [5], scheduleEnabled: true };
  const choices = {
    aiConfigs: [{ id: 9 }],
    sources: [{ id: 5, kind: "weiboHot" }],
  };
  assert.match(
    validateSchedule(preference, choices, false),
    /缺少热点执行权限/,
  );
  assert.equal(validateSchedule(preference, choices, true), null);
  assert.match(
    validateSchedule(preference, { ...choices, aiConfigs: [] }, true),
    /AI 配置已失效/,
  );
  assert.match(
    validateSchedule(preference, { ...choices, sources: [] }, true),
    /来源已失效/,
  );
  assert.match(
    validateSchedule(
      { ...preference, sourceIds: [1, 2, 3, 4, 5, 6] },
      {
        ...choices,
        sources: Array.from({ length: 6 }, (_, index) => ({ id: index + 1 })),
      },
      true,
    ),
    /最多选择 5 个/,
  );
});

test("三类来源与旧来源标记均不要求用户选择联网方式", () => {
  const choices = {
    aiConfigs: [{ id: 9, webSearchMode: "disabled" }],
    sources: [
      { id: 1, kind: "douyinHot", accessMode: "search" },
      { id: 2, kind: "weiboHot", accessMode: "search" },
      { id: 3, kind: "neteaseNews", accessMode: "page" },
    ],
  };
  for (const sourceIds of [[], [1], [2], [3], [1, 2, 3]])
    for (const aiConfigId of [null, 9])
      assert.equal(
        validateSchedule(
          { aiConfigId, sourceIds, scheduleEnabled: true },
          choices,
          true,
        ),
        null,
      );
});

test("创建并生成权限与模型选项读取权限一致，成功文案依据实际任务回执", () => {
  const source = sources.get("CreateArticle.vue");
  assert.match(source, /HotTopic\.create/);
  assert.match(source, /ContentArticle\.create/);
  assert.match(source, /ContentArticle\.update/);
  assert.match(source, /ContentTemplate\.read/);
  assert.match(source, /v-if="visible && form\.generate && canGenerate"/);
  assert.match(source, /result\.taskId/);
});
