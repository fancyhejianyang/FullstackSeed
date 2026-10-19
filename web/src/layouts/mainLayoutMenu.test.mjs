import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { compileStyle, parse } from "@vue/compiler-sfc";

const source = await readFile(
  new URL("./MainLayout.vue", import.meta.url),
  "utf8",
);
const { descriptor } = parse(source);
const style = compileStyle({
  source: descriptor.styles[0].content,
  filename: "MainLayout.vue",
  id: "data-v-menu-test",
  scoped: true,
});

function declarations(selector) {
  const values = {};
  style.rawResult.root.walkRules((rule) => {
    if (!rule.selectors.includes(`.layout__aside[data-v-menu-test] ${selector}`))
      return;
    rule.walkDecls(({ prop, value }) => {
      values[prop] = value;
    });
  });
  return values;
}

test("sidebar search keeps one always-mounted menu at the full sidebar width", () => {
  const menuTags = source.match(/<el-menu(?=[\s>])/g) ?? [];
  const menuRootTag = source.match(/<el-menu\b[^>]*>/)?.[0] ?? "";

  assert.equal(menuTags.length, 1);
  assert.doesNotMatch(menuRootTag, /\bv-show=/);
  assert.match(source, /<MenuTree :items="visibleMenus"\s*\/>/);
  assert.match(source, /\.layout__menu\s*\{[^}]*width:\s*100%;/s);
});

test("sidebar active group and current page have distinct scoped styles", () => {
  assert.deepEqual(style.errors, []);
  assert.deepEqual(
    declarations(".el-sub-menu.is-active > .el-sub-menu__title"),
    {
      color: "#fff",
      "font-weight": "600",
      background: "#304156",
      "box-shadow": "none",
    },
  );
  assert.deepEqual(declarations(".el-menu-item.is-active"), {
    color: "#fff",
    "font-weight": "600",
    background: "#1f5f99",
    "box-shadow": "inset 3px 0 0 #409eff",
  });
  assert.deepEqual(declarations(".el-menu-item.is-active:hover"), {
    background: "#1f5f99",
  });
});

test("inactive menus and groups retain their base, hover and expanded styles", () => {
  for (const selector of [".el-menu-item", ".el-sub-menu__title"]) {
    assert.deepEqual(declarations(selector), {
      color: "#bfcbd9",
      transition: "color 0.2s, background-color 0.2s",
    });
    assert.deepEqual(declarations(`${selector}:hover`), {
      color: "#fff",
      background: "rgba(64, 158, 255, 0.12)",
    });
  }
  assert.deepEqual(
    declarations(".el-sub-menu.is-opened > .el-sub-menu__title"),
    { color: "#fff", "font-weight": "600" },
  );
  assert.deepEqual(declarations(".el-menu"), {
    "border-right": "none",
    background: "#304156",
  });
  assert.deepEqual(declarations(".el-sub-menu .el-menu"), {
    background: "#304156",
  });
  assert.deepEqual(declarations(".el-sub-menu .el-menu-item"), {
    "padding-left": "50px",
  });
});
