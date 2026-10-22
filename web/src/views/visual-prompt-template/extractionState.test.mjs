import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("./extractionState.ts", import.meta.url),
  "utf8",
);
const indexSource = await readFile(
  new URL("./Index.vue", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const {
  clearVisualPromptExtractionState,
  runVisualPromptExtraction,
  updateVisualPromptExtractionState,
  visualPromptExtractionLabel,
} = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

const task = (id, status, stage = status) => ({
  id,
  taskType: "extract",
  templateId: id,
  workflowId: null,
  requestId: `request-${id}`,
  status,
  stage,
  result: null,
  errorMessage: null,
  createdAt: "2026-10-22T00:00:00.000Z",
  startedAt: null,
  finishedAt: null,
});

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("different rows keep independent extraction states and finish independently", async () => {
  const states = new Map();
  const firstResult = deferred();
  const secondResult = deferred();
  const run = (templateId, result) =>
    runVisualPromptExtraction({
      templateId,
      states,
      createRunId: () => `run-${templateId}`,
      submit: async () => task(templateId, "pending", "等待执行"),
      getTask: async () => result.promise,
      wait: async () => {},
    });

  const first = run(1, firstResult);
  const second = run(2, secondResult);
  await flush();

  assert.equal(states.size, 2);
  assert.equal(states.get(1).status, "pending");
  assert.equal(states.get(2).status, "pending");

  firstResult.resolve(task(1, "succeeded", "提炼完成"));
  await first;
  assert.equal(states.has(1), false);
  assert.equal(states.has(2), true);

  secondResult.resolve(task(2, "succeeded", "提炼完成"));
  await second;
  assert.equal(states.size, 0);
});

test("an old run cannot overwrite or clear a newer state for the same row", () => {
  const states = new Map([
    [
      3,
      {
        runId: "new-run",
        taskId: 30,
        status: "running",
        stage: "AI 正在提炼",
      },
    ],
  ]);

  assert.equal(
    updateVisualPromptExtractionState(
      states,
      3,
      "old-run",
      task(31, "succeeded"),
    ),
    false,
  );
  assert.equal(clearVisualPromptExtractionState(states, 3, "old-run"), false);
  assert.equal(states.get(3).runId, "new-run");
  assert.equal(states.get(3).status, "running");
});

test("labels distinguish submitting, queueing and active extraction", () => {
  assert.equal(visualPromptExtractionLabel(), "AI 提炼");
  assert.equal(visualPromptExtractionLabel({ status: "submitting" }), "提交中");
  assert.equal(visualPromptExtractionLabel({ status: "pending" }), "排队中");
  assert.equal(visualPromptExtractionLabel({ status: "running" }), "提炼中");
});

test("list binds each row to the shared map and lets Button await its own task", () => {
  assert.match(indexSource, /new Map<number, VisualPromptExtractionState>/);
  assert.match(indexSource, /:loading="extractionTasks\.has\(row\.id\)"/);
  assert.match(indexSource, /done\(extract\(row\)\)/);
  assert.doesNotMatch(indexSource, /extractingId/);
});
