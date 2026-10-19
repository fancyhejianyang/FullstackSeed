import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import * as vue from "vue";
import { parse, compileTemplate } from "@vue/compiler-sfc";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const listSource = await read("./Records.vue");
const detailSource = await read("./RecordView.vue");
const apiSource = await read("../../api/agentWorkspace.ts");
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const formatting = {};
new Function("exports", transpile(await read("./executionRecord.ts")))(
  formatting,
);

function harness(source, names, api = {}) {
  const props = vue.reactive({ row: null });
  const visible = vue.ref(false);
  const scope = vue.effectScope();
  const exports = {};
  scope.run(() =>
    new Function(
      "require",
      "exports",
      "defineProps",
      "defineModel",
      transpile(
        parse(source).descriptor.scriptSetup.content + `\nexport { ${names} };`,
      ),
    )(
      (name) => {
        if (name === "vue") return vue;
        if (name === "@/api/agentWorkspace") return api;
        if (name === "./executionRecord") return formatting;
        throw new Error(`Unexpected import: ${name}`);
      },
      exports,
      () => props,
      () => visible,
    ),
  );
  return { props, visible, scope, ...exports };
}

const flush = async () => {
  await vue.nextTick();
  await Promise.resolve();
  await vue.nextTick();
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("execution list excludes bulky columns and uses single-line Table defaults with a view action", () => {
  const h = harness(listSource, "columns, openView, currentRow, viewVisible");
  const props = h.columns.map((column) => column.prop);
  for (const field of [
    "modelRouting",
    "parameterSummary",
    "result",
    "configSnapshot",
    "configVersion",
    "errorMessage",
  ]) {
    assert.ok(!props.includes(field));
  }
  assert.ok(h.columns.every((column) => column.showOverflowTooltip !== false));
  assert.doesNotMatch(
    listSource,
    /white-space:\s*pre|JSON\.stringify|:result="row\.result"/,
  );
  assert.match(
    listSource,
    /<AgentExecutionStatusTag :status="row.status"\s*\/>/,
  );
  assert.match(listSource, /perm-module="agentApp"/);
  assert.match(listSource, /@view="openView"/);
  h.openView({ id: 7 });
  assert.equal(h.currentRow.value.id, 7);
  assert.equal(h.viewVisible.value, true);
  h.scope.stop();
});

test("list and detail templates compile and JSON is rendered as escaped text", () => {
  for (const [filename, source] of [
    ["Records.vue", listSource],
    ["RecordView.vue", detailSource],
  ]) {
    const parsed = parse(source);
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(
      compileTemplate({
        source: parsed.descriptor.template.content,
        filename,
        id: "execution-record-test",
      }).errors,
      [],
    );
  }
  assert.doesNotMatch(detailSource, /v-html/);
  for (const field of ["parameterSummary", "result", "configSnapshot"]) {
    assert.ok(detailSource.includes(`formatJson(detail.${field})`));
  }
  assert.match(detailSource, /:result="detail.result"/);
});

test("API list and lazy detail use management endpoints and the scalar contract", async () => {
  const calls = [];
  const api = {};
  new Function("require", "exports", transpile(apiSource))(
    () => ({
      default: {
        get: (url, options) => {
          calls.push({ url, options });
          return Promise.resolve({});
        },
      },
    }),
    api,
  );
  await api.getAgentExecutionRecords({ page: 2, keyword: "abc" });
  await api.getAgentExecutionRecord(7);
  assert.deepEqual(calls, [
    {
      url: "/agent-apps/execution-records",
      options: { params: { page: 2, keyword: "abc" } },
    },
    { url: "/agent-apps/execution-records/7", options: undefined },
  ]);
  const type = ts
    .createSourceFile("api.ts", apiSource, ts.ScriptTarget.Latest, true)
    .statements.find(
      (node) =>
        ts.isTypeAliasDeclaration(node) &&
        node.name.text === "AgentExecutionRecord",
    );
  const pick = type.type.types[0];
  assert.deepEqual(
    pick.typeArguments[1].types.map((node) => node.literal.text),
    [
      "id",
      "requestId",
      "sessionId",
      "userId",
      "agentAppId",
      "toolKey",
      "status",
      "statusReason",
      "totalTokens",
      "modelCallDurationMs",
      "startedAt",
      "finishedAt",
      "createdAt",
    ],
  );
});

test("detail loads only when opened and late results cannot replace a different record", async () => {
  const requests = [];
  const h = harness(detailSource, "detail, loading, failed", {
    getAgentExecutionRecord: (id) => {
      const request = { id, ...deferred() };
      requests.push(request);
      return request.promise;
    },
  });
  h.props.row = { id: 1 };
  await flush();
  assert.equal(requests.length, 0);
  h.visible.value = true;
  await flush();
  assert.equal(requests[0].id, 1);
  assert.equal(h.loading.value, true);
  h.props.row = { id: 2 };
  await flush();
  requests[1].resolve({ id: 2, result: { recordId: 8 } });
  await flush();
  requests[0].resolve({ id: 1 });
  await flush();
  assert.equal(h.detail.value.id, 2);
  assert.equal(h.loading.value, false);
  h.visible.value = false;
  await flush();
  assert.equal(h.detail.value, null);
  h.scope.stop();
});

test("failed loads do not show stale data and close/reopen ignores old failures", async () => {
  const requests = [];
  const h = harness(detailSource, "detail, loading, failed", {
    getAgentExecutionRecord: () => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    },
  });
  h.props.row = { id: 1 };
  h.visible.value = true;
  await flush();
  requests[0].reject(new Error("missing record"));
  await flush();
  assert.equal(h.failed.value, true);
  assert.equal(h.detail.value, null);
  assert.equal(h.loading.value, false);
  h.visible.value = false;
  await flush();
  h.visible.value = true;
  await flush();
  h.visible.value = false;
  await flush();
  h.visible.value = true;
  await flush();
  requests[1].reject(new Error("old response"));
  await flush();
  assert.equal(h.failed.value, false);
  assert.equal(h.loading.value, true);
  requests[2].resolve({ id: 1 });
  await flush();
  assert.equal(h.detail.value.id, 1);
  h.scope.stop();
});

test("detail preserves model trace information and tolerates absent legacy attempts", () => {
  assert.equal(formatting.routingSummary({ parameterSummary: null }), "—");
  assert.equal(
    formatting.routingSummary({
      parameterSummary: { modelRouting: { strategy: "priority" } },
    }),
    "优先顺序",
  );
  assert.equal(
    formatting.routingSummary({
      parameterSummary: {
        modelRouting: {
          strategy: "fixed",
          selectedModel: "example-model",
          decision: { intent: "chat", complexity: "simple" },
          attempts: [
            {
              purpose: "answer",
              model: "example-model",
              status: "succeeded",
              totalTokens: 0,
            },
          ],
        },
      },
    }),
    "指定模型 · example-model\n问答 · 简单\n回答：example-model · 成功 · 0 tokens",
  );
  assert.equal(formatting.toolLabel("media.imageGeneration"), "图片生成");
  assert.equal(formatting.statusReasonLabel("constructor"), "constructor");
});
