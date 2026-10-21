import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { compileTemplate, parse } from "@vue/compiler-sfc";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const edit = await read("./Edit.vue");
const view = await read("./View.vue");
const api = await read("../../api/aiMaterial.ts");

test("素材编辑模板可以编译", () => {
  for (const [filename, source] of [
    ["Edit.vue", edit],
    ["View.vue", view],
  ]) {
    const { descriptor, errors } = parse(source);
    assert.deepEqual(errors, [], filename);
    const result = compileTemplate({
      source: descriptor.template.content,
      filename,
      id: `ai-material-${filename}`,
      compilerOptions: { expressionPlugins: ["typescript"] },
    });
    assert.deepEqual(result.errors, [], filename);
  }
});

test("Wan 3.0 视频参数覆盖超宽画幅、智能时长和 2 至 30 秒", () => {
  assert.match(api, /\| "21:9"/);
  assert.match(api, /AiMaterialVideoDuration = number/);
  assert.match(edit, /"智能时长（默认约 5 秒）"/);
  assert.match(edit, /Array\.from\(\{ length: 29 \}/);
  assert.match(edit, /const seconds = index \+ 2/);
  assert.match(edit, /videoRatio: "adaptive"/);
  assert.match(view, /detail\.videoDuration === -1/);
});

test("视频参考图允许 20MB，图片生成仍保持 5MB", () => {
  assert.match(edit, /:max-size-mb="isVideoMode \? 20 : 5"/);
  assert.match(edit, /maxlength: isVideoMode\.value \? 20000 : 4000/);
});

test("多参考视频保留图片与视频顺序并只接收公开 HTTPS 地址", () => {
  assert.match(api, /\| "referenceToVideo"/);
  assert.match(api, /"reference_image"/);
  assert.match(api, /"reference_video"/);
  assert.match(edit, /多参考生视频/);
  assert.match(edit, /url\.protocol !== "https:"/);
  assert.match(edit, /视频总时长不超过 15 秒/);
  assert.match(view, /detail\.referenceMedia \|\| \[\]/);
});
