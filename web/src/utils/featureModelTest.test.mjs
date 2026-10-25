import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FeatureModelTestQueue,
  FeatureModelTestHistory,
} from "./featureModelTest.ts";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const settled = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function queue(run, extras = {}) {
  const results = [],
    errors = [];
  const instance = new FeatureModelTestQueue({
    run,
    onResult: (value, result, context) =>
      results.push({ value, result, current: context.isCurrent() }),
    onError: (value, error, context) =>
      errors.push({ value, error, current: context.isCurrent() }),
    ...extras,
  });
  instance.open();
  return { instance, results, errors };
}

test("快速连续选择只提交稳定后的最后一个模型", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  const { instance } = queue(async (value) => {
    calls.push(value);
    return value;
  });
  instance.schedule("A", "A");
  t.mock.timers.tick(200);
  instance.schedule("B", "B");
  t.mock.timers.tick(200);
  instance.schedule("C", "C");
  t.mock.timers.tick(399);
  assert.deepEqual(calls, []);
  t.mock.timers.tick(1);
  await settled();
  assert.deepEqual(calls, ["C"]);
});

test("请求中切换不并发提交，完成后只提交最后排队选择，旧响应不作为当前通知", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const first = deferred(),
    last = deferred(),
    calls = [];
  const { instance, results } = queue((value) => {
    calls.push(value);
    return value === "A" ? first.promise : last.promise;
  });
  instance.schedule("A", "A", true);
  instance.schedule("B", "B");
  instance.schedule("C", "C");
  t.mock.timers.tick(400);
  assert.deepEqual(calls, ["A"]);
  first.resolve("OK A");
  await settled();
  assert.deepEqual(calls, ["A", "C"]);
  assert.equal(results[0].current, false);
  last.resolve("OK C");
  await settled();
  assert.equal(results[1].current, true);
});

test("A→B→A 可复用已提交的 A，不再次计费", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const response = deferred(),
    calls = [];
  const firstA = { id: "a-first", sent: false };
  const { instance, results } = queue(
    (value) => {
      value.sent = true;
      calls.push(value.id);
      return response.promise;
    },
    { canReuseActive: (value) => value.sent },
  );
  instance.schedule(firstA, "A", true);
  instance.schedule({ id: "b", sent: false }, "B");
  const reused = instance.schedule({ id: "a-second", sent: false }, "A");
  assert.equal(reused, firstA);
  response.resolve("A OK");
  await settled();
  t.mock.timers.tick(1000);
  assert.deepEqual(calls, ["a-first"]);
  assert.equal(results[0].current, true);
});

test("A→B→A 不复用已作废的只读预检，最后的 A 仍会发出一次真实请求", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const check = deferred(),
    paid = [];
  let checks = 0;
  const { instance } = queue(
    async (value, context) => {
      checks++;
      await check.promise;
      if (!context.isCurrent()) return null;
      value.sent = true;
      paid.push(value.id);
      return "OK";
    },
    { canReuseActive: (value) => value.sent },
  );
  instance.schedule({ id: "a-old", sent: false }, "A", true);
  instance.schedule({ id: "b", sent: false }, "B");
  instance.schedule({ id: "a-latest", sent: false }, "A");
  t.mock.timers.tick(400);
  check.resolve();
  await settled();
  assert.equal(checks, 2);
  assert.deepEqual(paid, ["a-latest"]);
});

test("关闭和保存取消尚未提交的选择；预检结束后也不得补发", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [],
    check = deferred();
  const { instance } = queue(async (value, context) => {
    await check.promise;
    if (context.isCurrent()) calls.push(value);
    return value;
  });
  instance.schedule("A", "A");
  instance.close();
  t.mock.timers.tick(400);
  assert.deepEqual(calls, []);
  instance.open();
  instance.schedule("B", "B", true);
  instance.cancelPending();
  check.resolve();
  await settled();
  assert.deepEqual(calls, []);
});

test("关闭后重新打开仍等待旧请求结束，旧结果不写入新窗口", async () => {
  const first = deferred(),
    second = deferred(),
    calls = [];
  const { instance, results } = queue((value) => {
    calls.push(value);
    return value === "A" ? first.promise : second.promise;
  });
  instance.schedule("A", "A", true);
  instance.close();
  instance.open();
  instance.schedule("B", "B", true);
  assert.deepEqual(calls, ["A"]);
  first.resolve("old");
  await settled();
  assert.deepEqual(calls, ["A", "B"]);
  assert.deepEqual(results, []);
  second.resolve("new");
  await settled();
  assert.equal(results.length, 1);
  assert.equal(results[0].value, "B");
});

test("网络结果未知只报告一次，不自动重投", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const { instance, errors } = queue(async () => {
    calls++;
    throw new Error("response lost");
  });
  instance.schedule("A", "A", true);
  await settled();
  t.mock.timers.tick(60000);
  await settled();
  assert.equal(calls, 1);
  assert.equal(errors.length, 1);
});

test("本地网络未知不挡住较早服务器时间的真实成功，终态也不被迟到本地错误覆盖", () => {
  const history = new FeatureModelTestHistory();
  const unknown = {
    requestId: "A",
    status: "unknown",
    checkedAt: "2030-01-01T00:00:00Z",
  };
  const actual = {
    requestId: "A",
    status: "succeeded",
    checkedAt: "2026-10-25T00:00:00Z",
  };
  history.store(unknown, true);
  assert.equal(history.store(actual)[0], actual);
  assert.equal(history.store(unknown, true)[0], actual);
  assert.equal(
    history.store({
      requestId: "A",
      status: "accepted",
      checkedAt: "2026-10-24T23:59:59Z",
    })[0],
    actual,
  );
});

test("恢复历史保留服务器顺序且不挤掉新提交，按编号合并且限定记录数", () => {
  const history = new FeatureModelTestHistory(3);
  const row = (id) => ({
    requestId: id,
    status: "running",
    checkedAt: "2026-10-25T00:00:00Z",
  });
  history.store(row("new"), true);
  history.store(row("old-1"), false, false);
  history.store(row("old-2"), false, false);
  assert.deepEqual(
    history.store(row("old-3"), false, false).map((item) => item.requestId),
    ["new", "old-1", "old-2"],
  );
  assert.equal(
    history
      .store({ ...row("old-1"), status: "succeeded" })
      .filter((item) => item.requestId === "old-1").length,
    1,
  );
});
