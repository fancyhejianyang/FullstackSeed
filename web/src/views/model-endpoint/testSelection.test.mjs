import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  getExcludedEndpointTestAccountsHint,
  getInitialEndpointTestForm,
} from "./testSelection.ts";

const account = (id, codes = ["model-a", "model-b"]) => ({
  id,
  name: `账号 ${id}`,
  models: codes.map((code) => ({ code, name: code })),
});
const options = (overrides = {}) => ({
  card: { source: "builtin" },
  accounts: [account(1), account(2, ["model-c"])],
  requestBody: {
    model: "REPLACE_WITH_MODEL_CODE",
    messages: [{ role: "user", content: "测试" }],
  },
  recentTest: null,
  ...overrides,
});
const history = (providerId, model, extras = {}) => ({
  providerId,
  result: { model, ...extras },
});

test("系统通用多账号无历史时回填首个账号与首个模型，模板同步具体模型", () => {
  const data = options();
  const form = getInitialEndpointTestForm(data);
  assert.equal(form.providerId, 1);
  assert.equal(form.model, "model-a");
  assert.deepEqual(JSON.parse(form.requestBody), {
    ...data.requestBody,
    model: "model-a",
  });
  assert.equal(data.requestBody.model, "REPLACE_WITH_MODEL_CODE");
});

test("系统通用唯一账号的多个模型也默认第一个，不要求唯一模型", () => {
  const form = getInitialEndpointTestForm(options({ accounts: [account(7)] }));
  assert.equal(form.providerId, 7);
  assert.equal(form.model, "model-a");
});

test("系统通用优先恢复有效历史账号与模型，而非第一个候选", () => {
  const form = getInitialEndpointTestForm(
    options({ recentTest: history(2, "model-c") }),
  );
  assert.equal(form.providerId, 2);
  assert.equal(form.model, "model-c");
  assert.equal(JSON.parse(form.requestBody).model, "model-c");
  const otherModel = getInitialEndpointTestForm(
    options({ recentTest: history(1, "model-b") }),
  );
  assert.equal(otherModel.model, "model-b");
});

test("系统通用历史账号仍有效但模型已不在目录时，选择该账号首个现有模型", () => {
  const form = getInitialEndpointTestForm(
    options({ recentTest: history(2, "missing-model") }),
  );
  assert.equal(form.providerId, 2);
  assert.equal(form.model, "model-c");
  assert.equal(JSON.parse(form.requestBody).model, "model-c");
});

test("系统通用历史账号失效时，跳过空目录并默认首个可用账号", () => {
  for (const recentTest of [
    null,
    history(9, "missing-model"),
    history(1, "old"),
  ]) {
    const form = getInitialEndpointTestForm(
      options({
        accounts: [account(1, []), account(2, ["model-c"])],
        recentTest,
      }),
    );
    assert.equal(form.providerId, 2);
    assert.equal(form.model, "model-c");
  }
  const fallback = getInitialEndpointTestForm(
    options({ recentTest: history(9, "model-b") }),
  );
  assert.equal(fallback.providerId, 1);
  assert.equal(fallback.model, "model-a");
});

test("已明确退役的系统通用历史保持账号模型为空，不自动改选或补模型", () => {
  const form = getInitialEndpointTestForm(
    options({ recentTest: history(1, "model-a", { modelRemoved: true }) }),
  );
  assert.equal(form.providerId, "");
  assert.equal(form.model, "");
  assert.equal(JSON.parse(form.requestBody).model, "REPLACE_WITH_MODEL_CODE");
});

test("系统通用账号无有效目录时保持空选择，不从模板或历史伪造模型", () => {
  const form = getInitialEndpointTestForm(
    options({
      accounts: [account(1, []), { id: 2, name: "无目录" }],
      recentTest: history(1, "old-model"),
    }),
  );
  assert.equal(form.providerId, "");
  assert.equal(form.model, "");
  assert.equal(JSON.parse(form.requestBody).model, "REPLACE_WITH_MODEL_CODE");
});

test("初始化模板显式绑定选择，与旧模板模型或 watch 是否触发无关", () => {
  const form = getInitialEndpointTestForm(
    options({ requestBody: { model: "wrong-model", temperature: 0.4 } }),
  );
  assert.deepEqual(JSON.parse(form.requestBody), {
    model: "model-a",
    temperature: 0.4,
  });
});

test("专用卡片仍只恢复历史或唯一账号，多账号无历史不新增默认选择", () => {
  const configured = { card: { source: "configured" } };
  const multiple = getInitialEndpointTestForm(options(configured));
  assert.equal(multiple.providerId, "");
  assert.equal(multiple.model, "");
  const unique = getInitialEndpointTestForm(
    options({ ...configured, accounts: [{ id: 7, name: "无需模型目录" }] }),
  );
  assert.equal(unique.providerId, 7);
  const restored = getInitialEndpointTestForm(
    options({ ...configured, recentTest: history(2, "model-c") }),
  );
  assert.equal(restored.providerId, 2);
  assert.equal(restored.model, "model-c");
  const removed = getInitialEndpointTestForm(
    options({
      ...configured,
      accounts: [account(1)],
      recentTest: history(1, "model-a", { modelRemoved: true }),
    }),
  );
  assert.equal(removed.providerId, "");
  assert.equal(
    multiple.requestBody,
    JSON.stringify(options().requestBody, null, 2),
  );
});

test("回填 pending 历史只保留选择，不改变任务状态或编号", () => {
  const recentTest = history(2, "model-c", {
    requestId: "original-request",
    status: "accepted",
    taskId: "original-task",
  });
  const before = structuredClone(recentTest);
  const form = getInitialEndpointTestForm(options({ recentTest }));
  assert.equal(form.providerId, 2);
  assert.equal(form.model, "model-c");
  assert.deepEqual(recentTest, before);
});

test("旧选项响应缺少排除说明、空数组或尚未加载时不新增提示", () => {
  for (const data of [
    null,
    undefined,
    options(),
    options({ excludedAccounts: [] }),
  ])
    assert.equal(getExcludedEndpointTestAccountsHint(data), "");
});

test("展示同平台启用账号的受控排除原因，但不把排除账号加入候选", () => {
  const data = options({
    excludedAccounts: [
      {
        id: 3,
        name: "套餐账号",
        reasonCode: "emptyCatalog",
        reason: "普通调用模型目录为空",
      },
      {
        id: 4,
        name: "专用账号",
        reasonCode: "dedicatedOverride",
        reason: "目录模型均已配置专用卡片",
      },
      {
        id: 5,
        name: "待配置账号",
        reasonCode: "missingKey",
        reason: "未配置有效密钥",
      },
    ],
  });
  const before = structuredClone(data);
  assert.equal(
    getExcludedEndpointTestAccountsHint(data),
    "未列为候选的同平台启用账号：套餐账号：普通调用模型目录为空；专用账号：目录模型均已配置专用卡片；待配置账号：未配置有效密钥。",
  );
  assert.equal(getInitialEndpointTestForm(data).providerId, 1);
  assert.deepEqual(data, before);
});

test("打开与账号模型切换不新增付费入口，恢复历史仅恢复原编号并查询原任务", async () => {
  const source = (
    await readFile(new URL("./Test.vue", import.meta.url), "utf8")
  ).replace(/\r\n/g, "\n");
  const initialization = source.slice(
    source.indexOf("watch(\n  visible,"),
    source.indexOf("onBeforeUnmount("),
  );
  const selectionWatchers = source.slice(
    source.indexOf("watch(\n  () => form.providerId,"),
    source.indexOf("const statusLabels"),
  );
  assert.match(initialization, /getInitialEndpointTestForm\(data\)/);
  assert.match(
    initialization,
    /requestId\.value = previous\?\.result\.requestId/,
  );
  assert.match(initialization, /schedulePoll\(current, false\)/);
  assert.doesNotMatch(initialization, /testModelEndpoint\(|startTest\(/);
  assert.doesNotMatch(selectionWatchers, /testModelEndpoint\(|startTest\(/);
  assert.equal((source.match(/testModelEndpoint\(/g) ?? []).length, 1);
  assert.match(source, /@click="startTest"/);
  assert.match(
    source,
    /queryModelEndpointTest\(props\.row\.id, requestId\.value\)/,
  );
  assert.match(source, /getExcludedEndpointTestAccountsHint\(options\.value\)/);
  assert.match(
    source,
    /options: \(options\.value\?\.accounts \?\? \[\]\)\.map/,
  );
  const helper = await readFile(
    new URL("./testSelection.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    helper,
    /\b(testModelEndpoint|getModelEndpointTestOptions|queryModelEndpointTest|fetch)\s*\(/,
  );
});
