import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const helperSource = await readFile(
  new URL("./recreateTask.ts", import.meta.url),
  "utf8",
);
const indexSource = await readFile(
  new URL("./Index.vue", import.meta.url),
  "utf8",
);
const tableSource = await readFile(
  new URL("../comfy-task/TaskTable.vue", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { buildComfyTaskParameterDraft } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

const bindings = [
  {
    key: "prompt",
    label: "主提示词",
    type: "textarea",
    nodeId: "1",
    inputKey: "text",
    semanticRole: "mainPrompt",
  },
  {
    key: "steps",
    label: "步数",
    type: "number",
    nodeId: "2",
    inputKey: "steps",
    defaultValue: 20,
  },
  {
    key: "reference",
    label: "参考图",
    type: "image",
    nodeId: "3",
    inputKey: "image",
  },
];

test("new task keeps prompt empty and applies current workflow defaults", () => {
  assert.deepEqual(
    buildComfyTaskParameterDraft(bindings, undefined, new Set([8])),
    {
      parameters: { prompt: "", steps: 20, reference: "" },
      missingMaterialLabels: [],
    },
  );
});

test("recreation copies editable values, drops stale keys and preserves snapshot", () => {
  const snapshot = {
    prompt: "一只橘猫",
    steps: 32,
    reference: "8",
    removedBinding: "不会带入",
  };

  const result = buildComfyTaskParameterDraft(bindings, snapshot, new Set([8]));

  assert.deepEqual(result.parameters, {
    prompt: "一只橘猫",
    steps: 32,
    reference: "8",
  });
  assert.deepEqual(snapshot, {
    prompt: "一只橘猫",
    steps: 32,
    reference: "8",
    removedBinding: "不会带入",
  });
});

test("recreation clears deleted material references and reports their labels", () => {
  const result = buildComfyTaskParameterDraft(
    bindings,
    { prompt: "测试", steps: 20, reference: "99" },
    new Set([8]),
  );

  assert.equal(result.parameters.reference, "");
  assert.deepEqual(result.missingMaterialLabels, ["参考图"]);
});

test("completed task action loads detail into create flow instead of retrying it", () => {
  assert.match(tableSource, /row\.status === 'succeeded'/);
  assert.match(tableSource, /emit\(['"]recreate['"], row\)/);
  assert.match(indexSource, /@recreate="openRecreate"/);
  assert.match(indexSource, /await getComfyTask\(row\.id\)/);
  assert.match(indexSource, /await createComfyTask\(/);
});
