import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// 使用现有 TypeScript 依赖，不为这组纯函数回归引入新的测试框架。
const source = await readFile(
  new URL("./agentProgress.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { agentProgressText, createAgentProgressPoller } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const progress = (
  status = "running",
  requestId = "a",
  stage = "understanding",
) => ({
  executionId: 1,
  requestId,
  sessionId: 1,
  status,
  stage,
  startedAt: null,
});

test("labels follow actual phases; missing/failed progress never invents a search", () => {
  assert.equal(agentProgressText(null), "正在连接 Agent");
  assert.equal(agentProgressText(progress()), "正在理解需求");
  assert.equal(
    agentProgressText(progress("running", "a", "querying")),
    "正在搜索业务数据",
  );
  assert.equal(
    agentProgressText(progress("running", "a", "preparing_draft")),
    "正在整理录入草稿",
  );
  assert.equal(
    agentProgressText(progress("running", "a", "generating")),
    "AI 正在思考并生成回答",
  );
  assert.equal(
    agentProgressText(progress("running", "a", "future_stage")),
    "AI 正在处理",
  );
  assert.match(agentProgressText(progress(), true), /进度暂不可用/);
  for (const status of [
    "succeeded",
    "failed",
    "waiting_input",
    "waiting_confirmation",
  ]) {
    assert.equal(agentProgressText(progress(status)), "正在同步处理结果");
  }
  assert.equal(agentProgressText(progress("cancelled")), "已停止");
});

test("null initial result is normal; serial polling ends on completion", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const values = [null, progress(), progress("succeeded")];
  let calls = 0;
  const seen = [];
  const poller = createAgentProgressPoller({
    fetchProgress: async () => {
      calls++;
      return values.shift();
    },
    onProgress: (value) => seen.push(value),
    onUnavailable: () => assert.fail(),
  });
  poller.start("a");
  await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(1200);
  await flush();
  t.mock.timers.tick(1200);
  await flush();
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(calls, 3);
  assert.equal(seen.at(-1).status, "succeeded");
});

test("in-flight polling never overlaps and stop ignores late responses", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let resolve;
  let calls = 0;
  const seen = [];
  const poller = createAgentProgressPoller({
    fetchProgress: () => {
      calls++;
      return new Promise((done) => {
        resolve = done;
      });
    },
    onProgress: (value) => seen.push(value),
    onUnavailable: () => assert.fail(),
  });
  poller.start("a");
  t.mock.timers.tick(10000);
  await flush();
  assert.equal(calls, 1);
  poller.stop();
  resolve(progress());
  await flush();
  t.mock.timers.tick(10000);
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(seen, []);
});

test("a previous request cannot overwrite the next request", async () => {
  let resolveOld;
  const seen = [];
  const poller = createAgentProgressPoller({
    fetchProgress: (id) =>
      id === "a"
        ? new Promise((done) => {
            resolveOld = done;
          })
        : Promise.resolve(progress("succeeded", "b")),
    onProgress: (value) => seen.push(value),
    onUnavailable: () => assert.fail(),
  });
  poller.start("a");
  poller.start("b");
  await flush();
  resolveOld(progress());
  await flush();
  assert.deepEqual(
    seen.map((value) => value.requestId),
    ["b"],
  );
  poller.stop();
});

test("network failures back off and stop after three attempts", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  let errors = 0;
  const poller = createAgentProgressPoller({
    fetchProgress: async () => {
      calls++;
      throw new Error("offline");
    },
    onProgress: () => assert.fail(),
    onUnavailable: () => {
      errors++;
    },
  });
  poller.start("a");
  await flush();
  t.mock.timers.tick(1200);
  await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(1800);
  await flush();
  t.mock.timers.tick(3000);
  await flush();
  t.mock.timers.tick(10000);
  await flush();
  assert.equal(calls, 3);
  assert.equal(errors, 3);
});

test("all terminal and user-input states stop polling", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const status of [
    "cancelled",
    "failed",
    "succeeded",
    "waiting_input",
    "waiting_confirmation",
  ]) {
    let calls = 0;
    const poller = createAgentProgressPoller({
      fetchProgress: async () => {
        calls++;
        return progress(status);
      },
      onProgress: () => {},
      onUnavailable: () => assert.fail(),
    });
    poller.start("a");
    await flush();
    t.mock.timers.tick(10000);
    await flush();
    assert.equal(calls, 1, status);
    poller.stop();
  }
});

test("a response belonging to another request is never displayed", async () => {
  let errors = 0;
  const poller = createAgentProgressPoller({
    fetchProgress: async () => progress("running", "another"),
    onProgress: () => assert.fail(),
    onUnavailable: () => {
      errors++;
    },
  });
  poller.start("a");
  await flush();
  assert.equal(errors, 1);
  poller.stop();
});

test("recovering polling resumes real stages; stopping clears scheduled polling", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  let latest;
  const poller = createAgentProgressPoller({
    fetchProgress: async () => {
      calls++;
      if (calls === 1) throw new Error("offline");
      return progress("running", "a", "generating");
    },
    onProgress: (value) => {
      latest = value;
    },
    onUnavailable: () => {},
  });
  poller.start("a");
  await flush();
  t.mock.timers.tick(3000);
  await flush();
  assert.equal(latest.stage, "generating");
  poller.stop();
  t.mock.timers.tick(10000);
  await flush();
  assert.equal(calls, 2);
});
