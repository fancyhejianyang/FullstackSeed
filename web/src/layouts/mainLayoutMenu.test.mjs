import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(
  new URL("./MainLayout.vue", import.meta.url),
  "utf8",
);

test("sidebar search keeps one always-mounted menu at the full sidebar width", () => {
  const menuTags = source.match(/<el-menu(?=[\s>])/g) ?? [];
  const menuRootTag = source.match(/<el-menu\b[^>]*>/)?.[0] ?? "";

  assert.equal(menuTags.length, 1);
  assert.doesNotMatch(menuRootTag, /\bv-show=/);
  assert.match(source, /<MenuTree :items="visibleMenus"\s*\/>/);
  assert.match(source, /\.layout__menu\s*\{[^}]*width:\s*100%;/s);
});
