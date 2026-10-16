import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { computed, reactive } from "vue";

const sfc = await readFile(
  new URL("./AgentExecutionStatus.vue", import.meta.url),
  "utf8",
);
const source = sfc.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
const permissionSource = await readFile(
  new URL("../../../utils/permission.ts", import.meta.url),
  "utf8",
);
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const permission = {};
new Function("exports", transpile(permissionSource))(permission);
const script = transpile(source + "\nexport { statusMeta, statusTitle };");

function harness(values = {}) {
  const props = reactive(values);
  const exports = {};
  new Function("require", "exports", "defineProps", script)(
    (name) => {
      if (name === "vue") return { computed };
      if (name === "@/utils/permission") return permission;
      throw new Error(`Unexpected import: ${name}`);
    },
    exports,
    () => props,
  );
  return { props, ...exports };
}

test("missing, unknown and inherited property names always have renderable status metadata", () => {
  for (const status of [
    undefined,
    null,
    "",
    "future_status",
    "toString",
    "constructor",
    "__proto__",
  ]) {
    const h = harness({ status });
    // 原缺陷正是在模板读取 statusMeta.type 时抛错。
    assert.equal(h.statusMeta.value.type, "info");
    assert.equal(h.statusMeta.value.label, "未知状态");
    if (status) assert.equal(h.statusTitle.value, `原始执行状态：${status}`);
    else assert.equal(h.statusTitle.value, "执行状态缺失");
  }
});

test("known non-success statuses retain their original labels and colours", () => {
  const expected = {
    queued: ["排队中", "info"],
    running: ["执行中", "primary"],
    waiting_input: ["待补充", "warning"],
    waiting_confirmation: ["待确认", "warning"],
    submitting: ["提交中", "primary"],
    verifying: ["正在核实结果", "warning"],
    failed: ["失败", "danger"],
    cancelled: ["已停止", "info"],
  };
  for (const [status, [label, type]] of Object.entries(expected)) {
    assert.deepEqual(harness({ status }).statusMeta.value, { label, type });
  }
});

test("success still requires real receipts for writes and generated images", () => {
  const h = harness({
    status: "succeeded",
    toolKey: "productSku.create",
    result: null,
  });
  assert.equal(h.statusMeta.value.label, "结果待核实");
  h.props.result = { recordType: "productSku", recordId: 7 };
  assert.equal(h.statusMeta.value.label, "录入成功");
  h.props.toolKey = "media.imageGeneration";
  assert.equal(h.statusMeta.value.label, "图片结果待核实");
  h.props.result = { images: [{ id: 3 }] };
  assert.equal(h.statusMeta.value.label, "图片生成完成");
  for (const [toolKey, label] of [
    ["model.chat", "回答完成"],
    ["product.list", "查询完成"],
    ["media.vision", "识别完成"],
    ["future.tool", "处理完成"],
  ]) {
    h.props.toolKey = toolKey;
    assert.equal(h.statusMeta.value.label, label);
  }
});

test("a missing status can update to a known state and back without breaking rendering", () => {
  const h = harness();
  assert.equal(h.statusMeta.value.label, "未知状态");
  h.props.status = "running";
  assert.equal(h.statusMeta.value.label, "执行中");
  h.props.status = undefined;
  assert.equal(h.statusMeta.value.type, "info");
  assert.equal(h.statusMeta.value.label, "未知状态");
});
