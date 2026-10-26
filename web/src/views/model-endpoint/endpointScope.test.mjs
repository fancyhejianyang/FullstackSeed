import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "@vue/compiler-sfc";

async function readSfc(name) {
  const source = await readFile(new URL(name, import.meta.url), "utf8");
  const { descriptor, errors } = parse(source);
  assert.deepEqual(errors, []);
  return {
    source,
    script: descriptor.scriptSetup.content,
    template: descriptor.template.content,
  };
}

test("系统与专用页签按实际 source 查询，不在客户端伪造或改写卡片", async () => {
  const { script, template } = await readSfc("./Index.vue");
  assert.match(script, /source = ref<"builtin" \| "configured">\("builtin"\)/);
  assert.match(
    script,
    /getModelEndpoints\(\{ \.\.\.params, source: source\.value \}\)/,
  );
  assert.match(template, /label="系统通用" name="builtin"/);
  assert.match(template, /label="模型专用" name="configured"/);
});

test("系统通用筛选仅聊天与文本向量，专用仍保留全量分类和功能", async () => {
  const { script } = await readSfc("./Index.vue");
  assert.match(
    script,
    /options\.value\.functions\.filter\([\s\S]*?source\.value === "configured" \|\|\s*\["chat", "embedding"\]\.includes\(item\.value\)/,
  );
  assert.match(
    script,
    /options\.value\.categories \?\? \[\][\s\S]*?source\.value === "configured" \|\|\s*\["language", "embedding"\]\.includes\(item\.value\)/,
  );
  const api = await readFile(
    new URL("../../api/modelEndpoint.ts", import.meta.url),
    "utf8",
  );
  for (const functionType of ["vision", "textToImage", "textToVideo"])
    assert.match(api, new RegExp(`\\| "${functionType}"`));
});

test("列表、测试和详情明确识图及媒体属于模型专用，不再描述系统识图", async () => {
  const index = await readSfc("./Index.vue");
  const detail = await readSfc("./View.vue");
  const debug = await readSfc("./Test.vue");
  assert.match(index.template, /系统通用仅提供聊天（普通调用）和文本向量/);
  assert.match(index.template, /识图、生图、视频等请到“模型专用”页签/);
  assert.match(debug.script, /系统通用仅提供聊天和文本向量测试/);
  assert.match(debug.script, /识图、生图、视频等请到“模型专用”页签/);
  assert.match(
    detail.script,
    /仅聊天和文本向量；识图、生图、视频等在模型专用页签/,
  );
  for (const { source } of [index, detail, debug])
    assert.doesNotMatch(source, /系统识图|识图.{0,4}通用规则/);
});

test("专用测试仍仅需同平台启用账号与密钥，不新增目录要求", async () => {
  const { script } = await readSfc("./Test.vue");
  assert.match(
    script,
    /可选择同平台、已启用且已配置密钥的账号，无需先登记此模型/,
  );
  assert.match(
    script,
    /options: \(options\.value\?\.accounts \?\? \[\]\)\.map/,
  );
  assert.match(script, /\.\.\.\(isBuiltin\.value\s*\? \[/);
});

test("专用启停与权限拦截保留，不通过界面新增回退或自动调用", async () => {
  const index = await readSfc("./Index.vue");
  const detail = await readSfc("./View.vue");
  const debug = await readSfc("./Test.vue");
  assert.match(index.template, /已停用的专用卡片仍会阻止调用/);
  assert.match(detail.script, /已停用接口不会回退到系统通用/);
  assert.match(debug.template, /!options\?\.card\.isActive/);
  assert.match(debug.template, /perm="ModelEndpoint\.update"/);
  assert.match(debug.template, /@click="startTest"/);
  assert.equal((debug.script.match(/testModelEndpoint\(/g) ?? []).length, 1);
});
