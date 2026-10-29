import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import * as vue from "vue";
import { parse, compileTemplate, compileStyle } from "@vue/compiler-sfc";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const workspace = await read("./Index.vue");
const panel = await read("./components/AgentDebugPanel.vue");
const entry = await read("../knowledge-ai-chat/Index.vue");
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
  await vue.nextTick();
};
const app = (id) => ({
  id,
  name: `Agent ${id}`,
  responsibility: "长职责说明",
  models: ["model-a", "model-b"],
  tools: [],
  toolKeys: [],
  mediaCapabilities: { vision: true, imageGeneration: true },
});
const session = (id) => ({
  id,
  messages: [],
  pendingActions: [],
  executions: [],
  messageTotal: 0,
});

function workspaceHarness(debug = true) {
  const calls = [];
  let apps = [app(1), app(2)];
  let nextSession = 100;
  const mounted = [],
    unmounted = [];
  const exports = {};
  const api = {
    getAvailableAgentApps: async () => {
      calls.push(["apps"]);
      return apps;
    },
    getAgentSessions: async (params) => {
      calls.push(["sessions", params]);
      return { list: params.agentAppId === 1 ? [session(71)] : [], total: 1 };
    },
    getAgentSession: async (id) => {
      calls.push(["detail", id]);
      return session(id);
    },
    createAgentSession: async (data) => {
      calls.push(["create", data]);
      return session(nextSession++);
    },
    uploadAgentImage: async (id, file) => {
      calls.push(["upload", id, file.name]);
      return { id: 5, mimeType: file.type, size: file.size };
    },
    sendAgentMessage: async (id, data) => {
      calls.push(["send", id, data]);
      return {
        execution: {
          id: 9,
          requestId: `message:${id}:${data.clientMessageId}`,
          sessionId: id,
          status: "succeeded",
          startedAt: new Date().toISOString(),
        },
      };
    },
  };
  new Function(
    "require",
    "exports",
    "defineProps",
    "withDefaults",
    compile(
      parse(workspace).descriptor.scriptSetup.content +
        "\nexport { apps, selectedAgentId, selectedTextModel, inputText, activeSession, pendingMessages, send, uploadImage, attachedImage, newSession, openImagePicker, showImagePicker, switchAgent, refreshDebugConfiguration, debugRevision, AUTO_TEXT_MODEL };",
    ),
  )(
    (name) => {
      if (name === "vue")
        return {
          ...vue,
          onMounted: (fn) => mounted.push(fn),
          onUnmounted: (fn) => unmounted.push(fn),
        };
      if (name === "element-plus")
        return { ElMessage: { success() {}, warning() {}, error() {} } };
      if (name === "@/stores/user")
        return {
          useUserStore: () => ({
            userInfo: { id: 1 },
            hasPermission: () => false,
          }),
        };
      if (name === "@/api/agentWorkspace") return api;
      if (name === "./agentClipboard") return { imageUploadError: () => null };
      if (name === "./agentProgress")
        return {
          createAgentProgressPoller: () => ({ start() {}, stop() {} }),
          agentProgressText: () => "处理中",
        };
      return {};
    },
    exports,
    () => ({ debug }),
    (props) => props,
  );
  return {
    ...exports,
    calls,
    api,
    mount: () => mounted[0](),
    dispose: () => unmounted.forEach((fn) => fn()),
    setApps: (value) => {
      apps = value;
    },
  };
}

test("debug starts empty, does not read business history or create a session on entry/switch", async () => {
  const h = workspaceHarness();
  await h.mount();
  assert.deepEqual(h.calls, [["apps"]]);
  assert.equal(h.activeSession.value, null);
  h.selectedAgentId.value = "2";
  h.inputText.value = "old prompt";
  h.selectedTextModel.value = "model-a";
  await h.switchAgent();
  assert.equal(h.activeSession.value, null);
  assert.equal(h.inputText.value, "");
  assert.equal(h.selectedTextModel.value, h.AUTO_TEXT_MODEL);
  assert.deepEqual(h.calls, [["apps"]]);
  h.dispose();
});

test("debug sends through the current Agent API with fixed or Auto models and a named new session", async () => {
  const h = workspaceHarness();
  await h.mount();
  h.inputText.value = "请测试当前配置";
  h.selectedTextModel.value = "model-b";
  await h.send();
  await flush();
  assert.deepEqual(
    h.calls.find(([name]) => name === "create"),
    ["create", { agentAppId: 1, title: "调试 · Agent 1" }],
  );
  const firstSend = h.calls.find(([name]) => name === "send");
  assert.equal(firstSend[1], 100);
  assert.equal(firstSend[2].textModel, "model-b");
  assert.equal(firstSend[2].content, "请测试当前配置");
  assert.equal(firstSend[2].workflowId, undefined);
  assert.equal(firstSend[2].aiFeatureConfigId, undefined);
  h.inputText.value = "继续";
  h.selectedTextModel.value = h.AUTO_TEXT_MODEL;
  await h.send();
  await flush();
  assert.equal(h.calls.filter(([name]) => name === "create").length, 1);
  assert.equal(
    h.calls.filter(([name]) => name === "send")[1][2].textModel,
    undefined,
  );
  assert.ok(!h.calls.some(([name]) => name === "sessions"));
  h.dispose();
});

test("employee workspace still restores history and creates untitled normal sessions when needed", async () => {
  const h = workspaceHarness(false);
  await h.mount();
  assert.equal(h.activeSession.value.id, 71);
  assert.ok(h.calls.some(([name]) => name === "sessions"));
  assert.ok(!h.calls.some(([name]) => name === "create"));
  h.selectedAgentId.value = "2";
  await h.switchAgent();
  assert.deepEqual(
    h.calls.find(([name]) => name === "create"),
    ["create", { agentAppId: 2 }],
  );
  h.dispose();
});

test("the first debug image creates a session and uploads without automatically sending or invoking a model", async () => {
  const h = workspaceHarness();
  await h.mount();
  await h.uploadImage(new File(["image"], "test.png", { type: "image/png" }));
  assert.equal(h.activeSession.value.id, 100);
  assert.equal(h.attachedImage.value.id, 5);
  assert.deepEqual(
    h.calls.find(([name]) => name === "upload"),
    ["upload", 100, "test.png"],
  );
  assert.ok(!h.calls.some(([name]) => name === "send" || name === "sessions"));
  h.dispose();
});

test("a pending image picker cannot restore the previous Agent session after switching", async () => {
  const h = workspaceHarness();
  await h.mount();
  let release;
  h.api.createAgentSession = async () => new Promise((resolve) => { release = resolve; });
  const opening = h.openImagePicker();
  await flush();
  h.selectedAgentId.value = "2";
  await h.switchAgent();
  release(session(100));
  await opening;
  assert.equal(h.activeSession.value, null);
  assert.equal(h.showImagePicker.value, false);
  assert.ok(!h.calls.some(([name]) => name === "upload" || name === "detail"));
  h.dispose();
});

test("repeated send clicks while creating a session enqueue only one message", async () => {
  const h = workspaceHarness();
  await h.mount();
  let release;
  let created = 0;
  h.api.createAgentSession = async () => {
    created += 1;
    return new Promise((resolve) => { release = resolve; });
  };
  h.inputText.value = "测试图片";
  const first = h.send();
  await flush();
  await h.send();
  release(session(100));
  await first;
  await flush();
  assert.equal(created, 1);
  assert.equal(h.calls.filter(([name]) => name === "send").length, 1);
  h.dispose();
});

test("debug refresh updates authorized models, resets invalid fixed choices and does not call the model", async () => {
  const h = workspaceHarness();
  await h.mount();
  h.selectedTextModel.value = "model-b";
  h.setApps([{ ...app(1), models: ["new-model"] }]);
  await h.refreshDebugConfiguration();
  assert.equal(h.selectedTextModel.value, h.AUTO_TEXT_MODEL);
  assert.deepEqual(h.apps.value[0].models, ["new-model"]);
  assert.equal(h.debugRevision.value, 1);
  h.activeSession.value = session(123);
  h.setApps([app(2)]);
  await h.refreshDebugConfiguration();
  assert.equal(h.selectedAgentId.value, "2");
  assert.equal(h.activeSession.value, null);
  assert.ok(h.calls.every(([name]) => name === "apps"));
  h.pendingMessages.value = [{ status: "queued" }];
  await h.refreshDebugConfiguration();
  assert.equal(h.debugRevision.value, 2);
  h.dispose();
});

test("debug entry requires both permissions before mounting the executing workspace", () => {
  for (const permissions of [
    [],
    ["Menu.read"],
    ["AgentApp.read"],
    ["AgentWorkspace.read"],
    ["AgentApp.read", "AgentWorkspace.read"],
  ]) {
    const exports = {};
    new Function(
      "require",
      "exports",
      compile(
        parse(entry).descriptor.scriptSetup.content + "\nexport { canDebug };",
      ),
    )((name) => {
      if (name === "vue") return vue;
      if (name === "@/stores/user")
        return {
          useUserStore: () => ({
            hasPermission: (permission) => permissions.includes(permission),
          }),
        };
      return {};
    }, exports);
    assert.equal(
      exports.canDebug.value,
      permissions.includes("AgentApp.read") &&
        permissions.includes("AgentWorkspace.read"),
    );
  }
  assert.match(entry, /<AgentWorkspace v-if="canDebug" debug/);
  assert.doesNotMatch(
    entry,
    /askKnowledgeAi|getAiWorkflows|getAiFeatureConfigs/,
  );
});

test("debug templates and scoped styles compile; long content is wrapped only within debug UI", () => {
  for (const [filename, source] of [
    ["Index.vue", workspace],
    ["AgentDebugPanel.vue", panel],
    ["Debug.vue", entry],
  ]) {
    const { descriptor, errors } = parse(source);
    assert.deepEqual(errors, []);
    assert.deepEqual(
      compileTemplate({
        source: descriptor.template.content,
        filename,
        id: "debug-test",
      }).errors,
      [],
    );
    for (const style of descriptor.styles)
      assert.deepEqual(
        compileStyle({
          source: style.content,
          filename,
          id: "debug-test",
          scoped: true,
        }).errors,
        [],
      );
  }
  assert.match(workspace, /@container \(max-width: 1000px\)/);
  assert.match(
    workspace,
    /\.is-debug \.agent-workspace__agent-select > small\s*\{[^}]*white-space: normal;/,
  );
  assert.match(panel, /white-space: pre-wrap/);
  assert.doesNotMatch(panel, /line-clamp|v-html/);
});

test("configuration inspection ignores stale responses after Agent switches and handles errors", async () => {
  const requests = [];
  const props = vue.reactive({
    app: app(1),
    executions: [],
    revision: 0,
    busy: false,
  });
  const scope = vue.effectScope();
  const exports = {};
  scope.run(() =>
    new Function(
      "require",
      "exports",
      "defineProps",
      "defineEmits",
      compile(
        parse(panel).descriptor.scriptSetup.content +
          "\nexport { config, loading, failed, latestExecution, openExecution, selectedExecution, viewVisible };",
      ),
    )(
      (name) => {
        if (name === "vue") return vue;
        if (name === "@/api/agentApp")
          return {
            getAgentApp: (id) =>
              new Promise((resolve, reject) =>
                requests.push({ id, resolve, reject }),
              ),
          };
        return {};
      },
      exports,
      () => props,
      () => () => {},
    ),
  );
  assert.equal(requests[0].id, 1);
  props.app = app(2);
  await flush();
  requests[1].resolve({ id: 2, name: "Latest" });
  await flush();
  requests[0].resolve({ id: 1, name: "Stale" });
  await flush();
  assert.equal(exports.config.value.id, 2);
  props.executions = [{ id: 2 }, { id: 5 }, { id: 1 }];
  assert.equal(exports.latestExecution.value.id, 5);
  exports.openExecution();
  assert.equal(exports.selectedExecution.value.id, 5);
  props.revision++;
  await flush();
  assert.equal(exports.viewVisible.value, false);
  assert.equal(exports.config.value, null);
  requests[2].reject(new Error("unavailable"));
  await flush();
  assert.equal(exports.failed.value, true);
  assert.equal(exports.loading.value, false);
  scope.stop();
});
