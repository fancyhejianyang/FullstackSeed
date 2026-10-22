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
  {
    key: "poseVideo",
    label: "动作参考视频",
    type: "video",
    nodeId: "4",
    inputKey: "file",
  },
  {
    key: "motion",
    label: "动作描述",
    type: "textarea",
    nodeId: "5",
    inputKey: "prompt",
    semanticRole: "videoMotion",
    defaultValue: "工作流原始动作描述",
  },
];

test("new task keeps prompt empty and applies current workflow defaults", () => {
  assert.deepEqual(
    buildComfyTaskParameterDraft(bindings, undefined, new Set([8])),
    {
      parameters: {
        prompt: "",
        steps: 20,
        reference: "",
        poseVideo: "",
        motion: "",
      },
      missingMaterialLabels: [],
    },
  );
});

test("recreation copies editable values, drops stale keys and preserves snapshot", () => {
  const snapshot = {
    prompt: "一只橘猫",
    steps: 32,
    reference: "8",
    poseVideo: "9",
    motion: "人物转身并挥手",
    removedBinding: "不会带入",
  };

  const result = buildComfyTaskParameterDraft(
    bindings,
    snapshot,
    new Set([8, 9]),
  );

  assert.deepEqual(result.parameters, {
    prompt: "一只橘猫",
    steps: 32,
    reference: "8",
    poseVideo: "9",
    motion: "人物转身并挥手",
  });
  assert.deepEqual(snapshot, {
    prompt: "一只橘猫",
    steps: 32,
    reference: "8",
    poseVideo: "9",
    motion: "人物转身并挥手",
    removedBinding: "不会带入",
  });
});

test("recreation clears deleted material references and reports their labels", () => {
  const result = buildComfyTaskParameterDraft(
    bindings,
    { prompt: "测试", steps: 20, reference: "99", poseVideo: "98" },
    new Set([8]),
  );

  assert.equal(result.parameters.reference, "");
  assert.equal(result.parameters.poseVideo, "");
  assert.deepEqual(result.missingMaterialLabels, ["参考图", "动作参考视频"]);
});

test("completed task action loads detail into create flow instead of retrying it", () => {
  assert.match(tableSource, /row\.status === 'succeeded'/);
  assert.match(tableSource, /emit\(['"]recreate['"], row\)/);
  assert.match(indexSource, /@recreate="openRecreate"/);
  assert.match(indexSource, /await getComfyTask\(row\.id\)/);
  assert.match(indexSource, /await createComfyTask\(/);
});

test("task media is selected locally and uploaded only when submitting", () => {
  assert.match(indexSource, /<UploadImage/);
  assert.match(indexSource, /<UploadFile/);
  assert.match(indexSource, /URL\.createObjectURL\(file\)/);
  assert.match(indexSource, /await uploadComfyTaskInput\(file, file\.name\)/);
  assert.match(indexSource, /const taskParameters = await prepareTaskParameters/);
  assert.doesNotMatch(indexSource, /materialOptions\[binding\.type\]/);
});

test("AI composition fills workflow motion and camera bindings", () => {
  assert.match(indexSource, /"videoMotion"/);
  assert.match(indexSource, /"cameraMotion"/);
  assert.match(
    indexSource,
    /parameters\[binding\.key\] = result\.videoMotion \|\| ""/,
  );
  assert.match(
    indexSource,
    /parameters\[binding\.key\] = result\.cameraMotion \|\| ""/,
  );
});
