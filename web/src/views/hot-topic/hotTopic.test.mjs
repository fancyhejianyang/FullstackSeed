import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import * as vue from "vue";
import { parse, compileTemplate } from "@vue/compiler-sfc";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const apiSource = await read("../../api/hotTopic.ts");
const apiCode = ts.transpileModule(
  apiSource.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const api = new Function(
  "request",
  `${apiCode}; return {safeSourceUrl, activeRun, NETEASE_NEWS_API_URL, sourceKindLabels, sourceAccessLabels};`,
)({});
const preferenceCode = ts.transpileModule(
  (await read("./preferenceValidation.ts"))
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/^export /gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const validateSchedule = new Function(
  `${preferenceCode}; return scheduleValidationError;`,
)();
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

test("来源表单仅保留热点页面与固定网易国内新闻接口", () => {
  const source = sources.get("../hot-topic-source/Edit.vue");
  assert.match(source, /NETEASE_NEWS_API_URL/);
  assert.match(source, /新闻接口（固定）/);
  assert.match(source, /form\.kind === 'neteaseNews'/);
  assert.doesNotMatch(source, /央视新闻|央视网|钧正平/);
  assert.doesNotMatch(
    source,
    /douyinAccount|rss|jsonFeed|apiToken|clearApiToken/,
  );
  assert.doesNotMatch(source, /field-accountName|稳定账号标识|清除密钥/);
});

test("记录窗口先展示当前任务详情，再展示历史任务表格", () => {
  const source = sources.get("Runs.vue");
  assert.ok(source.indexOf('class="run-detail"') < source.indexOf("<Table"));
});

test("来源回填保留页面地址和获取方式，网易接口固定且切换后可恢复普通来源编辑", async () => {
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
  const context = {
    computed: vue.computed,
    reactive: vue.reactive,
    ref: vue.ref,
    watch: vue.watch,
    onBeforeUnmount: () => {},
    defineModel: () => visible,
    defineProps: () => props,
    defineEmits: () => () => {},
    useSubmissionGuard: () => {},
    getHotSource: async () => record,
    ...api,
  };
  const scope = vue.effectScope();
  const h = scope.run(() =>
    new Function(
      ...Object.keys(context),
      `${script}; return {form, fields, load};`,
    )(...Object.values(context)),
  );
  try {
    await h.load();
    assert.equal(h.form.url, api.NETEASE_NEWS_API_URL);
    assert.equal(h.form.accessMode, "page");
    assert.equal(
      h.fields.value.find((field) => field.prop === "url").componentProps
        .readonly,
      true,
    );
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
    assert.equal(h.form.accessMode, "search");
    h.form.kind = "neteaseNews";
    assert.equal(h.form.url, api.NETEASE_NEWS_API_URL);
    h.form.kind = "douyinHot";
    assert.equal(h.form.url, "");
    assert.equal(
      h.fields.value.find((field) => field.prop === "url").componentProps,
      undefined,
    );
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

test("模型或来源失效时仍允许关闭每日计划，未填模型可保存偏好设置", () => {
  const preference = {
    mode: "aiSearch",
    aiConfigId: 9,
    sourceIds: [4],
    scheduleEnabled: false,
  };
  assert.equal(
    validateSchedule(preference, { aiConfigs: [], sources: [] }, false),
    null,
  );
  assert.equal(
    validateSchedule(
      { ...preference, aiConfigId: null, sourceIds: [] },
      { aiConfigs: [], sources: [] },
      true,
    ),
    null,
  );
});

test("每日计划启用前校验执行权限、可用来源与真正联网协议", () => {
  const preference = {
    mode: "aiSearch",
    aiConfigId: 9,
    sourceIds: [],
    scheduleEnabled: true,
  };
  const choices = {
    aiConfigs: [{ id: 9, webSearchMode: "disabled" }],
    sources: [],
  };
  assert.match(
    validateSchedule(preference, choices, false),
    /缺少热点执行权限/,
  );
  assert.match(validateSchedule(preference, choices, true), /联网协议/);
  assert.equal(
    validateSchedule(
      preference,
      { ...choices, aiConfigs: [{ id: 9, webSearchMode: "bailianResponses" }] },
      true,
    ),
    null,
  );
  assert.match(
    validateSchedule({ ...preference, mode: "platform" }, choices, true),
    /至少选择一个来源/,
  );
  assert.match(
    validateSchedule(
      { ...preference, mode: "platform", sourceIds: [4] },
      { ...choices, sources: [{ id: 4, accessMode: "search" }] },
      true,
    ),
    /请切换/,
  );
});

test("仅选择网易国内新闻时所有模式允许无联网协议，混入平台搜索仍需联网", () => {
  const choices = {
    aiConfigs: [{ id: 9, webSearchMode: "disabled" }],
    sources: [
      { id: 4, kind: "neteaseNews", accessMode: "page" },
      { id: 5, kind: "weiboHot", accessMode: "page" },
    ],
  };
  for (const mode of ["aiSearch", "platform", "hybrid"]) {
    for (const aiConfigId of [null, 9]) {
      assert.equal(
        validateSchedule(
          { mode, aiConfigId, sourceIds: [4], scheduleEnabled: true },
          choices,
          true,
        ),
        null,
      );
    }
  }
  for (const mode of ["aiSearch", "hybrid"]) {
    assert.match(
      validateSchedule(
        { mode, aiConfigId: 9, sourceIds: [4, 5], scheduleEnabled: true },
        choices,
        true,
      ),
      /联网协议/,
    );
  }
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
