import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { scanTargets } from "./checkComponentUsage.mjs";

const execFileAsync = promisify(execFile);
const scriptFile = fileURLToPath(
  new URL("./checkComponentUsage.mjs", import.meta.url),
);
const wrapperNames = ["Form", "Button", "Input", "Select", "SelectMultiple"];
const rules = {
  replacements: {
    ElForm: ["Form"],
    ElButton: ["Button"],
    ElInput: ["Input"],
    ElSelect: ["Select", "SelectMultiple"],
  },
  native: { form: ["Form"], button: ["Button"], input: ["Input"] },
};

async function fixture(t, files = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "component-usage-test-"));
  const resolvedRoot = await realpath(root);
  t.after(async () => {
    // Remove only this test's freshly allocated fixture, never a caller-supplied path.
    assert.equal(await realpath(root), resolvedRoot);
    assert.match(path.basename(resolvedRoot), /^component-usage-test-/);
    await rm(resolvedRoot, { recursive: true, force: true });
  });
  const write = async (relativeFile, contents) => {
    const file = path.join(root, relativeFile);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents, "utf8");
    return file;
  };
  for (const name of wrapperNames) {
    await write(`components/${name}.vue`, "<template><div /></template>");
  }
  const mappingFile = await write(
    "registry.d.ts",
    `export {}\ndeclare module 'vue' {\n  export interface GlobalComponents {\n${wrapperNames
      .map(
        (name) =>
          `    ${name}: typeof import('./components/${name}.vue')['default']`,
      )
      .join(
        "\n",
      )}\n    ElForm: typeof import('element-plus/es')['ElForm']\n    ElCard: typeof import('element-plus/es')['ElCard']\n  }\n}\n`,
  );
  const configFile = await write("rules.json", JSON.stringify(rules));
  for (const [file, contents] of Object.entries(files))
    await write(file, contents);
  return {
    root,
    write,
    mappingFile,
    configFile,
    scan: (targets, options = {}) =>
      scanTargets({ cwd: root, targets, mappingFile, configFile, ...options }),
  };
}

function recommendationNames(report) {
  return report.findings.map((finding) => finding.replacements.join(","));
}

test("reports PascalCase and kebab-case primitives with actual source locations", async (t) => {
  const f = await fixture(t, {
    "Login.vue":
      "<template>\n  <ElForm />\n  <el-button />\n  <ElSelect />\n</template>",
  });
  const report = await f.scan(["Login.vue"]);
  assert.equal(report.errors.length, 0);
  assert.equal(report.summary.scannedFiles, 1);
  assert.equal(report.summary.findings, 3);
  assert.deepEqual(recommendationNames(report), [
    "Form",
    "Button",
    "Select,SelectMultiple",
  ]);
  assert.deepEqual(
    report.findings.map(({ line }) => line),
    [2, 3, 4],
  );
  assert.ok(
    report.findings.every(
      ({ column }) => Number.isInteger(column) && column > 0,
    ),
  );
});

test("counts mapped wrappers without treating a third-party mapping as a wrapper", async (t) => {
  const f = await fixture(t, {
    "Page.vue":
      "<template><Form /><Button /><select-multiple /><ElCard /></template>",
  });
  const report = await f.scan(["Page.vue"]);
  assert.equal(report.findings.length, 0);
  assert.deepEqual([...report.summary.usedComponents].sort(), [
    "Button",
    "Form",
    "SelectMultiple",
  ]);
  assert.deepEqual([...report.files[0].usedComponents].sort(), [
    "Button",
    "Form",
    "SelectMultiple",
  ]);
});

test("ignores Vue comments, JavaScript string literals and CSS text", async (t) => {
  const f = await fixture(t, {
    "Page.vue": `<template>\n<!-- <ElForm /><el-button /> -->\n<div>Plain text</div>\n</template>\n<script setup>\nconst example = '<ElForm /><el-button />'\n</script>\n<style>\n.example::before { content: '<ElForm />'; }\n</style>`,
  });
  const report = await f.scan(["Page.vue"]);
  assert.equal(report.errors.length, 0);
  assert.equal(report.findings.length, 0);
});

test("ignores an entire v-pre example subtree even with native auditing enabled", async (t) => {
  const f = await fixture(t, {
    "Page.vue": `<template>\n<section v-pre>\n  <ElForm />\n  <form><input /><button>Example</button></form>\n  <div><component is="ElForm" /><component :is="'ElButton'" /></div>\n</section>\n</template>`,
  });
  const report = await f.scan(["Page.vue"], { includeNative: true });
  assert.equal(report.errors.length, 0);
  assert.equal(report.findings.length, 0);
  assert.deepEqual(report.summary.usedComponents, []);
});

test("does not mistake v-pre text inside an attribute value for a directive", async (t) => {
  const f = await fixture(t, {
    "Page.vue": `<template><section title="Example v-pre attribute"><ElForm /></section></template>`,
  });
  const report = await f.scan(["Page.vue"]);
  assert.equal(report.errors.length, 0);
  assert.deepEqual(recommendationNames(report), ["Form"]);
});

test("parses legal TypeScript angle-bracket assertions without treating them as TSX", async (t) => {
  const f = await fixture(t, {
    "Page.vue": `<script setup lang="ts">\nconst value = <number>1\n</script>\n<template><ElForm /></template>`,
  });
  const report = await f.scan(["Page.vue"]);
  assert.equal(report.errors.length, 0);
  assert.deepEqual(recommendationNames(report), ["Form"]);
});

test("resolves Element Plus runtime import aliases", async (t) => {
  const f = await fixture(t, {
    "Page.vue": `<script setup lang="ts">\nimport { ElForm as RawForm, ElButton as RawButton } from 'element-plus'\n</script>\n<template><RawForm /><raw-button /></template>`,
  });
  const report = await f.scan(["Page.vue"]);
  assert.equal(report.errors.length, 0);
  assert.deepEqual(recommendationNames(report), ["Form", "Button"]);
});

test("reports a runtime primitive import even when no template node references it", async (t) => {
  const f = await fixture(t, {
    "Page.vue": `<script setup>\nimport { ElForm as RawForm } from 'element-plus'\n</script>\n<template><div /></template>`,
  });
  const report = await f.scan(["Page.vue"]);
  assert.deepEqual(recommendationNames(report), ["Form"]);
  assert.equal(report.findings[0].kind, "raw-component");
});

test("recognizes Element Plus subpath defaults and namespace member references", async (t) => {
  const f = await fixture(t, {
    "Page.vue": `<script setup>\nimport RawForm from 'element-plus/es/components/form/index'\nimport * as Element from 'element-plus'\n</script>\n<template><RawForm /><Element.ElButton /><component :is="Element.ElInput" /></template>`,
  });
  const report = await f.scan(["Page.vue"]);
  assert.equal(report.errors.length, 0);
  assert.deepEqual(recommendationNames(report), ["Form", "Button", "Input"]);
});

test("counts runtime wrapper imports even when the template does not render them", async (t) => {
  const f = await fixture(t, {
    "Page.vue": `<script setup>\nimport SharedForm from './components/Form.vue'\n</script>\n<template><div /></template>`,
  });
  const report = await f.scan(["Page.vue"]);
  assert.deepEqual(report.summary.usedComponents, ["Form"]);
});

test("recognizes a local wrapper imported under another name", async (t) => {
  const f = await fixture(t, {
    "Page.vue": `<script setup>\nimport SharedForm from './components/Form.vue'\n</script>\n<template><SharedForm /></template>`,
  });
  const report = await f.scan(["Page.vue"]);
  assert.equal(report.findings.length, 0);
  assert.deepEqual(report.summary.usedComponents, ["Form"]);
});

test("does not count a named helper export from a wrapper file as the component", async (t) => {
  const f = await fixture(t, {
    "Page.vue": `<script setup>\nimport { helper as Form } from './components/Form.vue'\n</script>\n<template><Form /></template>`,
  });
  const report = await f.scan(["Page.vue"]);
  assert.equal(report.errors.length, 0);
  assert.equal(report.findings.length, 0);
  assert.deepEqual(report.summary.usedComponents, []);
});

test("recognizes a local wrapper imported with named default syntax", async (t) => {
  const f = await fixture(t, {
    "Page.vue": `<script setup>\nimport { default as SharedForm } from './components/Form.vue'\n</script>\n<template><SharedForm /></template>`,
  });
  const report = await f.scan(["Page.vue"]);
  assert.equal(report.errors.length, 0);
  assert.equal(report.findings.length, 0);
  assert.deepEqual(report.summary.usedComponents, ["Form"]);
});

test("does not falsely count a third-party component shadowing a wrapper name", async (t) => {
  const f = await fixture(t, {
    "Page.vue": `<script setup>\nimport { Form } from 'another-ui-library'\n</script>\n<template><Form /></template>`,
  });
  const report = await f.scan(["Page.vue"]);
  assert.equal(report.findings.length, 0);
  assert.deepEqual(report.summary.usedComponents, []);
});

test("detects static component is values and statically imported dynamic identifiers", async (t) => {
  const f = await fixture(t, {
    "Page.vue": `<script setup>\nimport { ElForm as RawForm } from 'element-plus'\nconst runtimeChoice = getComponentName()\n</script>\n<template>\n<component is="ElForm" />\n<component :is="'el-button'" />\n<component :is="RawForm" />\n<component :is="runtimeChoice" />\n<component :is="ready ? 'ElForm' : 'div'" />\n</template>`,
  });
  const report = await f.scan(["Page.vue"]);
  assert.equal(report.errors.length, 0);
  assert.deepEqual(recommendationNames(report), ["Form", "Button", "Form"]);
  assert.ok(report.files[0].notices.length >= 2);
});

test("does not resolve type-only imports as runtime components", async (t) => {
  const f = await fixture(t, {
    "Page.vue": `<script setup lang="ts">\nimport type { ElForm as TypeForm } from 'element-plus'\nimport { type ElButton as TypeButton } from 'element-plus'\n</script>\n<template><TypeForm /><TypeButton /></template>`,
  });
  const report = await f.scan(["Page.vue"]);
  assert.equal(report.errors.length, 0);
  assert.equal(report.findings.length, 0);
});

test("does not guess that an unbound dynamic identifier is a global component string", async (t) => {
  const f = await fixture(t, {
    "Page.vue":
      '<template><component :is="ElForm" /><component :is="Form" /></template>',
  });
  const report = await f.scan(["Page.vue"]);
  assert.equal(report.errors.length, 0);
  assert.equal(report.findings.length, 0);
  assert.deepEqual(report.summary.usedComponents, []);
  assert.equal(report.files[0].notices.length, 2);
});

test("native-element auditing is opt-in and distinguishes uppercase wrappers", async (t) => {
  const f = await fixture(t, {
    "Page.vue":
      "<template><form><input /><button>Submit</button><Button /></form></template>",
  });
  const disabled = await f.scan(["Page.vue"], { includeNative: false });
  assert.equal(disabled.findings.length, 0);
  const enabled = await f.scan(["Page.vue"], { includeNative: true });
  assert.equal(enabled.findings.length, 3);
  assert.deepEqual(enabled.summary.usedComponents, ["Button"]);
  assert.deepEqual(recommendationNames(enabled), ["Form", "Input", "Button"]);
});

test("only filters both findings and reported wrapper usage", async (t) => {
  const f = await fixture(t, {
    "Page.vue": "<template><ElForm /><ElButton /><Form /><Button /></template>",
  });
  const report = await f.scan(["Page.vue"], { only: ["Form"] });
  assert.deepEqual(recommendationNames(report), ["Form"]);
  assert.deepEqual(report.summary.usedComponents, ["Form"]);
});

test("recursively scans Vue files and deduplicates overlapping file and directory targets", async (t) => {
  const f = await fixture(t, {
    "views/One.vue": "<template><ElForm /></template>",
    "views/nested/Two.vue": "<template><ElButton /></template>",
    "views/notes.txt": "<ElForm />",
    "views/example.ts": 'const text = "<ElForm />"',
  });
  const report = await f.scan(["views", "views/One.vue", "views/nested"]);
  assert.equal(report.errors.length, 0);
  assert.equal(report.summary.scannedFiles, 2);
  assert.equal(report.findings.length, 2);
  assert.equal(new Set(report.files.map(({ file }) => file)).size, 2);
});

test("skips mapped wrapper implementation files unless includeWrappers is enabled", async (t) => {
  const f = await fixture(t);
  await f.write("components/Form.vue", "<template><ElForm /></template>");
  const skipped = await f.scan(["components/Form.vue"]);
  assert.equal(skipped.summary.scannedFiles, 0);
  assert.equal(skipped.skippedFiles.length, 1);
  assert.equal(skipped.findings.length, 0);
  const included = await f.scan(["components/Form.vue"], {
    includeWrappers: true,
  });
  assert.equal(included.summary.scannedFiles, 1);
  assert.deepEqual(recommendationNames(included), ["Form"]);
});

test("does not exempt every local mapped component from auditing", async (t) => {
  const f = await fixture(t);
  await f.write("components/Composite.vue", "<template><ElForm /></template>");
  const registry = await readFile(f.mappingFile, "utf8");
  await f.write(
    "registry.d.ts",
    registry.replace(
      "export interface GlobalComponents {",
      "export interface GlobalComponents {\n    Composite: typeof import('./components/Composite.vue')['default']",
    ),
  );
  const report = await f.scan(["components/Composite.vue"]);
  assert.equal(report.summary.scannedFiles, 1);
  assert.deepEqual(recommendationNames(report), ["Form"]);
  await f.write(
    "rules.json",
    JSON.stringify({ ...rules, implementationComponents: ["Composite"] }),
  );
  const excluded = await f.scan(["components/Composite.vue"]);
  assert.equal(excluded.summary.scannedFiles, 0);
  assert.equal(excluded.skippedFiles.length, 1);
});

test("applies explicit file or directory exclusions", async (t) => {
  const f = await fixture(t, {
    "views/One.vue": "<template><ElForm /></template>",
    "views/ignored/Two.vue": "<template><ElButton /></template>",
    "views/Three.vue": "<template><ElInput /></template>",
  });
  const report = await f.scan(["views"], {
    exclude: ["views/ignored", "views/Three.vue"],
  });
  assert.equal(report.summary.scannedFiles, 1);
  assert.deepEqual(recommendationNames(report), ["Form"]);
});

test("reports an absent target instead of silently returning a clean audit", async (t) => {
  const f = await fixture(t);
  const report = await f.scan(["missing.vue"]);
  assert.ok(report.errors.length > 0);
  assert.equal(report.summary.errors, report.errors.length);
  assert.equal(report.summary.scannedFiles, 0);
});

test("reports malformed Vue while still auditing other valid targets", async (t) => {
  const f = await fixture(t, {
    "Broken.vue": "<template><div></template>",
    "Valid.vue": "<template><ElForm /></template>",
  });
  const report = await f.scan(["Broken.vue", "Valid.vue"]);
  assert.ok(report.errors.length > 0);
  assert.ok(report.errors.some(({ file }) => file.endsWith("Broken.vue")));
  assert.deepEqual(recommendationNames(report), ["Form"]);
});

test("reports unsupported external templates instead of returning a clean audit", async (t) => {
  const f = await fixture(t, {
    "External.vue": '<template src="./template.html"></template>',
    "template.html": "<ElForm />",
  });
  const report = await f.scan(["External.vue"]);
  assert.ok(report.errors.length > 0);
});

test("reports unsupported template preprocessors instead of returning a clean audit", async (t) => {
  const f = await fixture(t, {
    "Pug.vue": '<template lang="pug">\nElForm\n</template>',
  });
  const report = await f.scan(["Pug.vue"]);
  assert.ok(report.errors.length > 0);
});

test("reports a missing registry", async (t) => {
  const f = await fixture(t, { "Page.vue": "<template><ElForm /></template>" });
  const report = await f.scan(["Page.vue"], {
    mappingFile: path.join(f.root, "missing.d.ts"),
  });
  assert.ok(report.errors.length > 0);
});

test("reports an invalid registry declaration", async (t) => {
  const f = await fixture(t, { "Page.vue": "<template><ElForm /></template>" });
  await f.write(
    "registry.d.ts",
    "declare module 'vue' { interface GlobalComponents { Form: ??? }",
  );
  const report = await f.scan(["Page.vue"]);
  assert.ok(report.errors.length > 0);
});

test("reports a registry with no GlobalComponents interface", async (t) => {
  const f = await fixture(t, { "Page.vue": "<template><ElForm /></template>" });
  await f.write(
    "registry.d.ts",
    "export interface Unrelated { value: string }",
  );
  const report = await f.scan(["Page.vue"]);
  assert.ok(report.errors.length > 0);
});

test("reports malformed JSON configuration", async (t) => {
  const f = await fixture(t, { "Page.vue": "<template><ElForm /></template>" });
  await f.write("rules.json", '{"replacements":');
  const report = await f.scan(["Page.vue"]);
  assert.ok(report.errors.length > 0);
});

test("reports invalid replacement shapes rather than ignoring the configuration", async (t) => {
  const f = await fixture(t, { "Page.vue": "<template><ElForm /></template>" });
  await f.write(
    "rules.json",
    JSON.stringify({ replacements: { ElForm: 123 } }),
  );
  const report = await f.scan(["Page.vue"]);
  assert.ok(report.errors.length > 0);
});

test("auditing is read-only for targets and mapping/configuration files", async (t) => {
  const f = await fixture(t, {
    "Page.vue": "<template><ElForm /><Button /></template>",
  });
  const paths = [path.join(f.root, "Page.vue"), f.mappingFile, f.configFile];
  const before = await Promise.all(paths.map((file) => readFile(file, "utf8")));
  await f.scan(["Page.vue"]);
  const after = await Promise.all(paths.map((file) => readFile(file, "utf8")));
  assert.deepEqual(after, before);
});

async function runCli(f, args) {
  try {
    const result = await execFileAsync(
      process.execPath,
      [
        scriptFile,
        "--mapping",
        f.mappingFile,
        "--config",
        f.configFile,
        ...args,
      ],
      { cwd: f.root, encoding: "utf8" },
    );
    return { ...result, code: 0 };
  } catch (error) {
    // A spawn/permission error must fail the test, not masquerade as a CLI exit code.
    if (typeof error.code !== "number") throw error;
    return error;
  }
}

test("CLI default report succeeds despite findings and --json emits parseable JSON", async (t) => {
  const f = await fixture(t, { "Page.vue": "<template><ElForm /></template>" });
  const result = await runCli(f, ["Page.vue", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).summary.findings, 1);
});

test("CLI strict mode exits 1 for findings and 0 for clean files", async (t) => {
  const f = await fixture(t, {
    "Page.vue": "<template><ElForm /></template>",
    "Clean.vue": "<template><Form /></template>",
  });
  const finding = await runCli(f, ["Page.vue", "--strict", "--json"]);
  assert.equal(finding.code, 1, finding.stderr);
  assert.equal(JSON.parse(finding.stdout).summary.findings, 1);
  const clean = await runCli(f, ["Clean.vue", "--strict", "--json"]);
  assert.equal(clean.code, 0, clean.stderr);
});

test("CLI exits 2 for invalid targets or arguments", async (t) => {
  const f = await fixture(t);
  const missing = await runCli(f, ["missing.vue", "--json"]);
  assert.equal(missing.code, 2, missing.stderr);
  assert.ok(JSON.parse(missing.stdout).errors.length > 0);
  const invalid = await runCli(f, ["--not-a-real-option"]);
  assert.equal(invalid.code, 2);
});

test("CLI supports comma-separated component filters", async (t) => {
  const f = await fixture(t, {
    "Page.vue": "<template><ElForm /><ElButton /><ElInput /></template>",
  });
  const result = await runCli(f, [
    "Page.vue",
    "--json",
    "--only",
    "Form,Button",
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(recommendationNames(JSON.parse(result.stdout)), [
    "Form",
    "Button",
  ]);
});
