import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const indexSource = await readFile(
  new URL("./Index.vue", import.meta.url),
  "utf8",
);
const apiSource = await readFile(
  new URL("../../api/comfyUi.ts", import.meta.url),
  "utf8",
);

test("素材列表按组渲染多项预览并使用组内素材数量", () => {
  assert.match(indexSource, /row\.items\.slice\(0, 4\)/);
  assert.match(indexSource, /row\.itemCount - 4/);
  assert.match(indexSource, /imagePreviewUrls\(row\)/);
});

test("单删、批删和收藏均展开为组内素材 IDs", () => {
  assert.match(indexSource, /deleteComfyMaterialGroup\(row\.materialIds\)/);
  assert.match(indexSource, /rows\.flatMap\(\(row\) => row\.materialIds\)/);
  assert.match(
    indexSource,
    /updateComfyMaterialGroupFavorite\(row\.materialIds, !row\.isFavorite\)/,
  );
  assert.match(apiSource, /\/comfyui\/materials\/group\/favorite/);
  assert.match(apiSource, /\/comfyui\/materials\/group/);
});

test("视频使用首帧与播放图标预览，素材库不提供主动上传入口", () => {
  assert.match(indexSource, /<video/);
  assert.match(indexSource, /preload="metadata"/);
  assert.match(indexSource, /<VideoPlay/);
  assert.doesNotMatch(indexSource, /上传输入素材/);
  assert.doesNotMatch(indexSource, /uploadComfyMaterial/);
  assert.doesNotMatch(indexSource, /<Dialog/);
});
