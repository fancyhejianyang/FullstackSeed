import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "@vue/compiler-sfc";

const source = await readFile(new URL("./Test.vue", import.meta.url), "utf8");
const { descriptor, errors } = parse(source);
const script = descriptor.scriptSetup.content;
const template = descriptor.template.content;

test("卡片结果类型可选接收执行时来源、规则名和功能名，兼容旧历史", async () => {
  const api = await readFile(
    new URL("../../api/modelEndpoint.ts", import.meta.url),
    "utf8",
  );
  const resultType = api.slice(
    api.indexOf("export interface ModelEndpointTestResult"),
    api.indexOf("export interface ModelEndpointTestOptions"),
  );
  assert.match(resultType, /source\?: "builtin" \| "configured" \| "standard"/);
  assert.match(resultType, /ruleName\?: string/);
  assert.match(resultType, /functionLabel\?: string/);
});

test("结果来源只读取执行快照，未知旧结果不猜作当前入口来源", () => {
  assert.deepEqual(errors, []);
  const origin = script.slice(
    script.indexOf("const actualSourceLabel"),
    script.indexOf("const statusColor"),
  );
  assert.match(origin, /switch \(result\.value\?\.source\)/);
  assert.match(origin, /case "configured":\s*return "模型专用"/);
  assert.match(origin, /case "builtin":\s*return "系统通用"/);
  assert.match(origin, /case "standard":\s*return "标准兼容接口"/);
  assert.match(origin, /default:\s*return "旧结果未记录"/);
  assert.doesNotMatch(origin, /isBuiltin|options|props|card|row/);
  assert.match(template, /实际配置来源：\{\{ actualSourceLabel \}\}/);
});

test("实际规则与路径来自执行结果，缺失规则不使用当前卡片名称替代", () => {
  assert.match(
    template,
    /实际规则：\{\{ result\.ruleName\?\.trim\(\) \|\| "旧结果未记录" \}\}/,
  );
  assert.match(template, /功能场景：\{\{ result\.functionLabel \}\}/);
  assert.match(template, /调用路径：POST \{\{ result\.apiPath \}\}/);
});

test("兼容提示只允许启用且严格同格式的聊天向量专用卡，仍实际执行专用配置", () => {
  assert.match(
    script,
    /已启用且调用格式与当前通用规则完全一致的聊天或文本向量专用卡/,
  );
  assert.match(script, /实际仍使用专用配置/);
  assert.match(script, /停用或格式不同的专用卡请到“模型专用”页签处理/);
  assert.match(script, /系统通用仅提供聊天和文本向量测试/);
  assert.doesNotMatch(script, /已配置专用卡片的模型请到专用卡片测试/);
});

test("入口来源、选择及原任务恢复保持不变，显示来源不新增自动付费入口", () => {
  assert.match(
    script,
    /isBuiltin = computed\(\(\) => options\.value\?\.card\.source === "builtin"\)/,
  );
  assert.match(
    script,
    /Object\.assign\(form, getInitialEndpointTestForm\(data\)\)/,
  );
  assert.match(script, /requestId\.value = previous\?\.result\.requestId/);
  assert.match(
    script,
    /queryModelEndpointTest\(props\.row\.id, requestId\.value\)/,
  );
  assert.match(script, /crypto\.randomUUID\(\)/);
  assert.equal((script.match(/testModelEndpoint\(/g) ?? []).length, 1);
  assert.match(template, /@click="startTest"/);
  assert.match(template, /!options\?\.card\.isActive/);
});
