import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("./selectDisplay.ts", import.meta.url),
  "utf8",
);
const exports = {};
new Function(
  "exports",
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
)(exports);

const { resolveSelectDisplayValue } = exports;

test("non-filterable Select keeps the current label visible while opened", () => {
  assert.equal(resolveSelectDisplayValue(true, false, "", "豆皮AI"), "豆皮AI");
});

test("filterable Select shows the live search text while opened", () => {
  assert.equal(resolveSelectDisplayValue(true, true, "豆", "豆皮AI"), "豆");
  assert.equal(resolveSelectDisplayValue(false, true, "", "豆皮AI"), "豆皮AI");
});
