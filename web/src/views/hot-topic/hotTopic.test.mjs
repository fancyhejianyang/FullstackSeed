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
  `${apiCode}; return {safeSourceUrl, activeRun, NETEASE_NEWS_API_URL, sourceKindLabels, sourceAccessLabels, modeLabels};`,
)({});
const fixedSourcesCode = ts.transpileModule(
  (await read("../../api/hotTopicSources.ts"))
    .replace(/^import[\s\S]*?;\r?\n/gm, "")
    .replace(/^export /gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const fixedSources = new Function(
  ...Object.keys(api),
  `${fixedSourcesCode}; return {DOUYIN_HOT_API_URL, fixedHotSourceUrl, hotSourceAccessLabel};`,
)(...Object.values(api));
const preferenceCode = ts.transpileModule(
  (await read("./preferenceValidation.ts"))
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/^export /gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const preferenceFunctions = new Function(
  ...Object.keys(fixedSources),
  `${preferenceCode}; return {scheduleValidationError, preferenceRequiresSearch, supportsHotSearchMode};`,
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

test("抖音与网易固定接口契约及页面说明一致，微博仍保留来源配置", () => {
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
  for (const kind of ["douyinHot", "neteaseNews"])
    assert.equal(
      fixedSources.hotSourceAccessLabel({ kind, accessMode: "search" }),
      "固定接口",
    );
  assert.equal(
    fixedSources.hotSourceAccessLabel({
      kind: "weiboHot",
      accessMode: "search",
    }),
    api.sourceAccessLabels.search,
  );
  assert.match(source, /DOUYIN_HOT_API_URL/);
  assert.match(source, /来源接口（固定）/);
  assert.match(source, /data\.word_list/);
  assert.match(source, /form\.kind === ["']neteaseNews["']/);
  assert.doesNotMatch(source, /央视新闻|央视网|钧正平/);
  assert.doesNotMatch(
    source,
    /douyinAccount|rss|jsonFeed|apiToken|clearApiToken/,
  );
  assert.doesNotMatch(source, /field-accountName|稳定账号标识|清除密钥/);
  for (const filename of [
    "../hot-topic-source/Index.vue",
    "../hot-topic-source/View.vue",
  ])
    assert.match(sources.get(filename), /hotSourceAccessLabel/);
  assert.match(
    sources.get("../hot-topic-source/Index.vue"),
    /页面 \/ 固定接口/,
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
    ElMessage: { success: () => {} },
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
    assert.equal(h.form.accessMode, "page");
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
    assert.equal(h.form.accessMode, "page");
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
    assert.equal(h.form.accessMode, "search");
    h.form.kind = "neteaseNews";
    assert.equal(h.form.url, api.NETEASE_NEWS_API_URL);
    h.form.kind = "douyinHot";
    assert.equal(h.form.url, fixedSources.DOUYIN_HOT_API_URL);
    assert.equal(h.form.accessMode, "page");
    h.form.url = "https://tampered.example.com/hot";
    h.form.accessMode = "search";
    await h.submit();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].url, fixedSources.DOUYIN_HOT_API_URL);
    assert.equal(saved[0].accessMode, "page");
    h.form.kind = "weiboHot";
    assert.equal(h.form.url, "");
    assert.equal(
      h.fields.value.find((field) => field.prop === "url").componentProps,
      undefined,
    );
    assert.equal(
      h.fields.value.some((field) => field.prop === "accessMode"),
      true,
    );
    props.row = null;
    const previousReads = reads;
    await h.load();
    assert.equal(reads, previousReads);
    assert.equal(h.form.kind, "douyinHot");
    assert.equal(h.form.url, fixedSources.DOUYIN_HOT_API_URL);
    assert.equal(h.form.accessMode, "page");
    assert.equal(saved.length, 1);
  } finally {
    scope.stop();
  }
});

test("偏好页仅选固定来源不显示联网警告，来源标签与微博混合提示准确", () => {
  const visible = vue.ref(true);
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
    onBeforeUnmount: () => {},
    defineModel: () => visible,
    defineEmits: () => () => {},
    useSubmissionGuard: () => {},
    useUserStore: () => ({ hasPermission: () => true }),
    modeLabels: api.modeLabels,
    getHotPreference: async () => {
      requests++;
    },
    getHotOptions: async () => {
      requests++;
    },
    ...fixedSources,
    ...preferenceFunctions,
  };
  const scope = vue.effectScope();
  const h = scope.run(() =>
    new Function(
      ...Object.keys(context),
      `${script}; return {form, options, sourceOptions, directSourcesIgnored, searchProtocolHint, fields};`,
    )(...Object.values(context)),
  );
  try {
    h.options.value.sources = [
      { id: 1, name: "抖音热点", kind: "douyinHot", accessMode: "search" },
      { id: 2, name: "网易国内新闻", kind: "neteaseNews", accessMode: "page" },
      { id: 3, name: "微博热点", kind: "weiboHot", accessMode: "page" },
    ];
    h.form.sourceIds = ["1", "2"];
    for (const mode of ["aiSearch", "platform", "hybrid"]) {
      h.form.mode = mode;
      assert.equal(h.searchProtocolHint.value, "");
      assert.equal(h.directSourcesIgnored.value, false);
    }
    assert.deepEqual(
      h.sourceOptions.value.slice(0, 2).map((row) => row.label),
      ["抖音热点 · 固定接口", "网易国内新闻 · 固定接口"],
    );
    h.form.mode = "aiSearch";
    h.form.sourceIds = [];
    assert.equal(h.searchProtocolHint.value, "");
    assert.match(
      h.fields.value.find((field) => field.prop === "mode").hint,
      /默认读取抖音固定榜单/,
    );
    h.form.sourceIds = ["1", "3"];
    assert.match(h.searchProtocolHint.value, /依赖 AI 联网搜索/);
    assert.equal(h.directSourcesIgnored.value, true);
    h.form.mode = "hybrid";
    assert.match(h.searchProtocolHint.value, /混合模式仍可先采集/);
    assert.equal(requests, 0);
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
    sourceIds: [5],
    scheduleEnabled: true,
  };
  const choices = {
    aiConfigs: [{ id: 9, webSearchMode: "disabled" }],
    sources: [{ id: 5, kind: "weiboHot", accessMode: "page" }],
  };
  assert.match(
    validateSchedule(preference, choices, false),
    /缺少热点执行权限/,
  );
  assert.match(validateSchedule(preference, choices, true), /联网协议/);
  assert.match(
    validateSchedule(
      preference,
      { ...choices, aiConfigs: [{ id: 9, webSearchMode: "bailianChat" }] },
      true,
    ),
    /原生联网协议/,
  );
  for (const webSearchMode of ["bailianResponses", "tokenhubSearch"])
    assert.equal(
      validateSchedule(
        preference,
        { ...choices, aiConfigs: [{ id: 9, webSearchMode }] },
        true,
      ),
      null,
    );
  assert.match(
    validateSchedule(
      { ...preference, mode: "platform", sourceIds: [] },
      choices,
      true,
    ),
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

test("抖音网易在全部模式始终直读，历史搜索标记也不要求模型联网", () => {
  const choices = {
    aiConfigs: [{ id: 9, webSearchMode: "disabled" }],
    sources: [
      { id: 4, kind: "neteaseNews", accessMode: "page" },
      { id: 5, kind: "weiboHot", accessMode: "page" },
      { id: 6, kind: "douyinHot", accessMode: "search" },
    ],
  };
  for (const mode of ["aiSearch", "platform", "hybrid"]) {
    for (const aiConfigId of [null, 9]) {
      for (const sourceIds of [[4], [6], [4, 6]])
        assert.equal(
          validateSchedule(
            { mode, aiConfigId, sourceIds, scheduleEnabled: true },
            choices,
            true,
          ),
          null,
        );
    }
  }
  assert.match(
    validateSchedule(
      {
        mode: "aiSearch",
        aiConfigId: 9,
        sourceIds: [4, 5],
        scheduleEnabled: true,
      },
      choices,
      true,
    ),
    /原生联网协议/,
  );
  for (const aiConfigId of [null, 9]) {
    assert.equal(
      validateSchedule(
        {
          mode: "hybrid",
          aiConfigId,
          sourceIds: [4, 5],
          scheduleEnabled: true,
        },
        choices,
        true,
      ),
      null,
    );
  }
});

test("AI 模式未选来源默认固定抖音榜单，不要求联网；其它模式仍要求来源", () => {
  const preference = {
    mode: "aiSearch",
    aiConfigId: null,
    sourceIds: [],
    scheduleEnabled: true,
  };
  const choices = { aiConfigs: [], sources: [] };
  assert.equal(validateSchedule(preference, choices, true), null);
  assert.equal(
    preferenceFunctions.preferenceRequiresSearch("aiSearch", []),
    false,
  );
  for (const mode of ["platform", "hybrid"])
    assert.match(
      validateSchedule({ ...preference, mode }, choices, true),
      /至少选择一个来源/,
    );
});

test("搜索来源为主的混合模式要求已接入的原生搜索，直读来源允许普通 AI 推荐", () => {
  const preference = {
    mode: "hybrid",
    aiConfigId: 9,
    sourceIds: [5],
    scheduleEnabled: true,
  };
  const searchSource = { id: 5, kind: "weiboHot", accessMode: "search" };
  for (const webSearchMode of ["disabled", "bailianChat"]) {
    const choices = {
      aiConfigs: [{ id: 9, webSearchMode }],
      sources: [searchSource],
    };
    assert.match(validateSchedule(preference, choices, true), /原生联网协议/);
    assert.equal(
      validateSchedule(
        preference,
        { ...choices, sources: [{ ...searchSource, accessMode: "page" }] },
        true,
      ),
      null,
    );
    assert.equal(
      validateSchedule(
        preference,
        { ...choices, sources: [{ ...searchSource, kind: "neteaseNews" }] },
        true,
      ),
      null,
    );
  }
  for (const webSearchMode of ["bailianResponses", "tokenhubSearch"])
    assert.equal(
      validateSchedule(
        preference,
        {
          aiConfigs: [{ id: 9, webSearchMode }],
          sources: [searchSource],
        },
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
