import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("./agentClipboard.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { clipboardImages, imageUploadError } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const image = { type: "image/png", size: 200 };
const item = { kind: "file", type: image.type, getAsFile: () => image };

test("ordinary text / HTML / empty clipboard is not treated as an image", () => {
  assert.deepEqual(clipboardImages(null), []);
  assert.deepEqual(
    clipboardImages({
      items: [{ kind: "string", type: "text/html" }],
      files: [],
    }),
    [],
  );
});
test("extracts screenshots, avoids items/files duplication, preserves multiple-image detection", () => {
  assert.deepEqual(clipboardImages({ items: [item], files: [image] }), [image]);
  assert.deepEqual(clipboardImages({ items: [item, item], files: [] }), [
    image,
    image,
  ]);
  assert.deepEqual(
    clipboardImages({
      items: [{ ...item, getAsFile: () => null }],
      files: [image],
    }),
    [image],
  );
});
test("validates identical paste/upload size and format boundaries", () => {
  assert.equal(imageUploadError(image), null);
  for (const type of ["image/jpeg", "image/webp"])
    assert.equal(imageUploadError({ type, size: 5 * 1024 * 1024 }), null);
  assert.match(imageUploadError({ type: "image/svg+xml", size: 10 }), /仅支持/);
  assert.match(imageUploadError({ ...image, size: 0 }), /不能为空/);
  assert.match(
    imageUploadError({ ...image, size: 5 * 1024 * 1024 + 1 }),
    /不能超过/,
  );
});
