#!/usr/bin/env node
/** Read-only component audit. Registry is data: never import or execute it. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseSfc } from "vue/compiler-sfc";
import ts from "typescript";

const scriptFile = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(scriptFile), "..");
const defaultMapping = path.join(webRoot, "components.d.ts");
const defaultConfig = path.join(webRoot, "scripts/componentUsageRules.json");
const ignoredDirectories = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-ssr",
  "coverage",
  ".vite",
]);
const normalizeName = (name) => name.replaceAll("-", "").toLowerCase();
const displayPath = (file) => file.replaceAll("\\", "/");
const pathKey = (file) =>
  process.platform === "win32" ? file.toLowerCase() : file;
const within = (file, parent) => {
  const relative = path.relative(parent, file);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
};
const kebab = (name) =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const nameText = (node) =>
  node && (ts.isIdentifier(node) || ts.isStringLiteral(node))
    ? node.text
    : undefined;

function sourceFile(file, content, kind = ts.ScriptKind.TS) {
  const parsed = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  if (parsed.parseDiagnostics.length) {
    const issue = parsed.parseDiagnostics[0];
    throw new Error(ts.flattenDiagnosticMessageText(issue.messageText, "\n"));
  }
  return parsed;
}

async function resolveImport(source, owner, root) {
  const absolute = source.startsWith(".")
    ? path.resolve(path.dirname(owner), source)
    : source.startsWith("@/")
      ? path.resolve(root, "src", source.slice(2))
      : null;
  if (!absolute) return null;
  return fs.realpath(absolute).catch(() => absolute);
}

async function readRegistry(file) {
  const parsed = sourceFile(file, await fs.readFile(file, "utf8"));
  const entries = [];
  const visit = (node) => {
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name.text === "GlobalComponents"
    ) {
      for (const member of node.members) {
        const name = nameText(member.name);
        if (!name || !ts.isPropertySignature(member)) continue;
        const inspect = (child) => {
          if (
            ts.isImportTypeNode(child) &&
            ts.isLiteralTypeNode(child.argument) &&
            ts.isStringLiteral(child.argument.literal)
          ) {
            const source = child.argument.literal.text;
            if (
              (source.startsWith(".") || source.startsWith("@/")) &&
              /\.vue$/i.test(source)
            )
              entries.push({ name, source });
          }
          ts.forEachChild(child, inspect);
        };
        if (member.type) inspect(member.type);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  if (!entries.length)
    throw new Error(
      "GlobalComponents 中没有本地 .vue 组件映射，请检查声明文件是否存在或已过期",
    );
  const components = new Map();
  for (const entry of entries) {
    const local = await resolveImport(entry.source, file, path.dirname(file));
    if (!(await fs.stat(local).catch(() => null))?.isFile())
      throw new Error(`映射 ${entry.name} 指向不存在的组件：${entry.source}`);
    if (components.has(entry.name))
      throw new Error(`GlobalComponents 存在重复映射：${entry.name}`);
    components.set(entry.name, { ...entry, file: local });
  }
  return components;
}

async function readRules(file, registry, explicit) {
  const config = JSON.parse(await fs.readFile(file, "utf8"));
  if (!config || Array.isArray(config) || typeof config !== "object")
    throw new Error("规则配置必须是 JSON 对象");
  const load = (name, required) => {
    const object = config[name] ?? (required ? null : {});
    if (!object || Array.isArray(object) || typeof object !== "object")
      throw new Error(`${name} 必须是组件名到目标数组的对象`);
    const rules = new Map();
    for (const [from, to] of Object.entries(object)) {
      if (
        !from ||
        !Array.isArray(to) ||
        !to.length ||
        to.some((v) => typeof v !== "string" || !v)
      )
        throw new Error(`${name}.${from} 必须是非空组件名数组`);
      if (explicit && to.some((v) => !registry.has(v)))
        throw new Error(
          `${name}.${from} 引用了不在 GlobalComponents 本地映射中的组件`,
        );
      const available = [...new Set(to.filter((v) => registry.has(v)))];
      if (available.length)
        rules.set(name === "native" ? from : normalizeName(from), available);
    }
    return rules;
  };
  const replacements = load("replacements", true);
  const native = load("native", false);
  const extra = config.implementationComponents ?? [];
  if (!Array.isArray(extra) || extra.some((v) => typeof v !== "string"))
    throw new Error("implementationComponents 必须是组件名数组");
  if (explicit && extra.some((v) => !registry.has(v)))
    throw new Error("implementationComponents 引用了不存在的本地组件");
  const implementations = new Set(
    [...replacements.values(), ...native.values()].flat().concat(extra),
  );
  return { replacements, native, implementations };
}

function literalExpression(value) {
  if (!value) return null;
  const parsed = ts.createSourceFile(
    "expression.ts",
    `(${value})`,
    ts.ScriptTarget.Latest,
    true,
  );
  if (parsed.parseDiagnostics.length) return null;
  let expression = parsed.statements[0]?.expression;
  while (expression && ts.isParenthesizedExpression(expression))
    expression = expression.expression;
  if (!expression) return null;
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  )
    return { value: expression.text, literal: true };
  if (
    ts.isIdentifier(expression) ||
    (ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression))
  )
    return { value: expression.getText(parsed), literal: false };
  return null;
}

async function inspectVue(file, content, registry, rules, options) {
  const result = {
    file: displayPath(file),
    usedComponents: [],
    findings: [],
    notices: [],
  };
  const { descriptor, errors } = parseSfc(content, { filename: file });
  if (errors.length)
    throw new Error(
      errors.map((e) => (typeof e === "string" ? e : e.message)).join("; "),
    );
  if (
    descriptor.template?.src ||
    (descriptor.template?.lang && descriptor.template.lang !== "html")
  )
    throw new Error("暂不支持外部 template src 或非 HTML 模板，请单独人工检查");
  const used = new Set();
  const bindings = new Map();
  const referencedBindings = new Set();
  const recordUse = (name) => {
    if (!options.only.size || options.only.has(name)) used.add(name);
  };
  const locate = (offset) => {
    const prefix = content.slice(0, offset);
    return {
      line: prefix.split("\n").length,
      column: offset - prefix.lastIndexOf("\n"),
    };
  };
  const notice = (node, message) =>
    result.notices.push({ ...locate(node.loc.start.offset), message });
  const registryByFile = new Map(
    [...registry].map(([name, item]) => [pathKey(item.file), name]),
  );
  const isElementPlus = (source) =>
    source === "element-plus" || source.startsWith("element-plus/");
  const rawFromPath = (source) => {
    const part = source.match(/(?:^|\/)components\/([a-z-]+)(?:\/|$)/)?.[1];
    return part
      ? `El${part
          .split("-")
          .map((s) => s[0].toUpperCase() + s.slice(1))
          .join("")}`
      : null;
  };

  for (const block of [descriptor.script, descriptor.scriptSetup].filter(
    Boolean,
  )) {
    if (block.src) throw new Error("暂不支持外部 script src，请单独人工检查");
    const kind =
      block.lang === "tsx"
        ? ts.ScriptKind.TSX
        : block.lang === "jsx"
          ? ts.ScriptKind.JSX
          : block.lang === "ts"
            ? ts.ScriptKind.TS
            : ts.ScriptKind.JS;
    const parsed = sourceFile(file, block.content, kind);
    for (const statement of parsed.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const source = statement.moduleSpecifier.text;
        const clause = statement.importClause;
        if (!clause || clause.isTypeOnly) continue;
        const localPath = await resolveImport(source, file, options.webRoot);
        const wrapper = localPath && registryByFile.get(pathKey(localPath));
        const register = (local, imported, start) => {
          const defaultWrapper = imported === "default" && wrapper;
          const canonical =
            defaultWrapper ||
            (isElementPlus(source)
              ? imported === "default"
                ? rawFromPath(source)
                : imported
              : null);
          const info = {
            kind: defaultWrapper ? "wrapper" : canonical ? "raw" : "other",
            name: canonical,
            offset: block.loc.start.offset + start,
          };
          bindings.set(local, info);
          if (defaultWrapper) recordUse(defaultWrapper);
        };
        if (clause.name)
          register(clause.name.text, "default", clause.name.getStart(parsed));
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const binding of clause.namedBindings.elements) {
            if (!binding.isTypeOnly)
              register(
                binding.name.text,
                (binding.propertyName ?? binding.name).text,
                binding.getStart(parsed),
              );
          }
        } else if (
          clause.namedBindings &&
          ts.isNamespaceImport(clause.namedBindings)
        ) {
          bindings.set(clause.namedBindings.name.text, {
            kind: isElementPlus(source) ? "namespace" : "other",
          });
        }
      } else {
        // Local runtime bindings shadow globals. Type declarations do not.
        const hide = (name) => {
          if (ts.isIdentifier(name)) bindings.set(name.text, { kind: "other" });
          else if (
            ts.isObjectBindingPattern(name) ||
            ts.isArrayBindingPattern(name)
          ) {
            for (const item of name.elements)
              if (ts.isBindingElement(item)) hide(item.name);
          }
        };
        if (ts.isVariableStatement(statement))
          for (const declaration of statement.declarationList.declarations)
            hide(declaration.name);
        if (
          (ts.isFunctionDeclaration(statement) ||
            ts.isClassDeclaration(statement)) &&
          statement.name
        )
          hide(statement.name);
      }
    }
  }

  const resolveName = (name, nativeTag = false, bindingOnly = false) => {
    if (nativeTag) return { kind: "native", name };
    let bindingName = name;
    let binding = bindings.get(name);
    if (!binding) {
      const found = [...bindings].find(([key]) => kebab(key) === name);
      if (found) [bindingName, binding] = found;
    }
    if (binding) {
      referencedBindings.add(bindingName);
      return binding;
    }
    const [namespace, member] = name.split(".");
    if (member && bindings.get(namespace)?.kind === "namespace")
      return { kind: "raw", name: member };
    if (bindingOnly) return { kind: "other" };
    const global = [...registry.keys()].find(
      (key) => key === name || (name.includes("-") && kebab(key) === name),
    );
    return global ? { kind: "wrapper", name: global } : { kind: "raw", name };
  };

  const report = (info, tag, offset, origin) => {
    if (info.kind === "wrapper") {
      recordUse(info.name);
      return;
    }
    if (info.kind === "other" || info.kind === "namespace") return;
    let replacements =
      info.kind === "native"
        ? options.includeNative
          ? rules.native.get(info.name)
          : undefined
        : rules.replacements.get(normalizeName(info.name));
    if (!replacements) return;
    replacements = replacements.filter(
      (name) => !options.only.size || options.only.has(name),
    );
    if (!replacements.length) return;
    result.findings.push({
      file: result.file,
      ...locate(offset),
      kind: info.kind === "native" ? "native-element" : "raw-component",
      tag,
      replacements,
      message: `${origin}引用 ${tag}，建议核对是否可复用 ${replacements.join(" / ")}（接口与行为需人工确认）`,
    });
  };

  const walk = (node, inPre = false) => {
    if (node.type === 1) {
      // Vue removes v-pre from the AST. Inspect only the opening tag, stripping
      // quoted attribute values so a title containing "v-pre" cannot hide usage.
      const openingTag =
        node.loc.source.match(/^<(?:[^>"']|"[^"]*"|'[^']*')*>/)?.[0] ?? "";
      const pre =
        inPre ||
        /\sv-pre(?:\s|=|\/?>)/.test(
          openingTag.replace(/"[^"]*"|'[^']*'/g, '""'),
        );
      if (pre) return;
      if (node.tag === "component" && node.tagType === 1) {
        const prop = node.props.find(
          (p) =>
            (p.type === 6 && p.name === "is") ||
            (p.type === 7 &&
              p.name === "bind" &&
              p.arg?.content === "is" &&
              p.arg.isStatic),
        );
        const value =
          prop?.type === 6
            ? { value: prop.value?.content, literal: true }
            : literalExpression(prop?.exp?.content);
        if (value?.value) {
          const info = resolveName(
            value.value,
            value.literal && rules.native.has(value.value),
            !value.literal,
          );
          if (info.kind === "other" || info.kind === "namespace")
            notice(node, "动态 :is 无法静态确定，需人工检查");
          else report(info, value.value, node.loc.start.offset, "动态组件");
        } else notice(node, "动态 :is 无法静态确定，需人工检查");
      } else {
        report(
          resolveName(node.tag, node.tagType === 0),
          node.tag,
          node.loc.start.offset,
          "模板",
        );
      }
    }
    for (const child of node.children ?? []) walk(child, inPre);
  };
  if (descriptor.template?.ast) walk(descriptor.template.ast);
  else
    result.notices.push({
      line: 1,
      column: 1,
      message: "无内联模板，仅检查显式运行时组件导入，不检查 render/JSX",
    });
  for (const [local, binding] of bindings) {
    if (binding.kind === "raw" && !referencedBindings.has(local))
      report(binding, local, binding.offset, "运行时导入");
  }
  result.usedComponents = [...used].sort();
  result.findings.sort((a, b) => a.line - b.line || a.column - b.column);
  return result;
}

export async function scanTargets(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const mappingFile = path.resolve(cwd, options.mappingFile ?? defaultMapping);
  const configFile = path.resolve(cwd, options.configFile ?? defaultConfig);
  const report = {
    mappingFile: displayPath(mappingFile),
    components: [],
    files: [],
    findings: [],
    errors: [],
    skippedFiles: [],
    summary: {},
  };
  const error = (file, reason) =>
    report.errors.push({
      file: displayPath(file),
      line: 1,
      column: 1,
      message: reason instanceof Error ? reason.message : String(reason),
    });
  let registry, rules;
  const only = new Set(options.only ?? []);
  try {
    registry = await readRegistry(mappingFile);
    for (const name of only)
      if (!registry.has(name))
        throw new Error(
          `--only 指定的组件不在 GlobalComponents 本地映射中：${name}`,
        );
  } catch (reason) {
    error(mappingFile, reason);
  }
  if (registry && !report.errors.length) {
    try {
      rules = await readRules(
        configFile,
        registry,
        Boolean(options.configFile),
      );
    } catch (reason) {
      error(configFile, reason);
    }
  }
  if (rules) {
    report.components = [...registry.values()].map((item) => ({
      ...item,
      file: displayPath(item.file),
    }));
    const implementations = new Set(
      [...registry]
        .filter(([name]) => rules.implementations.has(name))
        .map(([, item]) => pathKey(item.file)),
    );
    const excluded = (options.exclude ?? []).map((file) =>
      path.resolve(cwd, file),
    );
    const visited = new Set();
    const skipped = (file, reason) =>
      report.skippedFiles.push({ file: displayPath(file), reason });
    const scan = async (file, explicit = false) => {
      try {
        const stats = await fs.lstat(file);
        if (stats.isSymbolicLink()) {
          skipped(file, "跳过符号链接，避免循环或越界扫描");
          return;
        }
        const resolved = await fs.realpath(file);
        const key = pathKey(resolved);
        if (visited.has(key)) return;
        visited.add(key);
        if (excluded.some((parent) => within(resolved, parent))) {
          skipped(resolved, "命中 --exclude");
          return;
        }
        if (
          resolved
            .split(path.sep)
            .some((segment) => ignoredDirectories.has(segment))
        ) {
          skipped(resolved, "依赖或产物目录");
          return;
        }
        if (stats.isDirectory()) {
          for (const child of (await fs.readdir(resolved)).sort())
            await scan(path.join(resolved, child));
          return;
        }
        if (!stats.isFile() || !/\.vue$/i.test(resolved)) {
          if (explicit) throw new Error("只支持 .vue 文件或包含 .vue 的目录");
          return;
        }
        if (!options.includeWrappers && implementations.has(key)) {
          skipped(resolved, "基础封装实现允许使用底层组件");
          return;
        }
        const result = await inspectVue(
          resolved,
          await fs.readFile(resolved, "utf8"),
          registry,
          rules,
          { ...options, only, webRoot: path.dirname(mappingFile) },
        );
        report.files.push(result);
        report.findings.push(...result.findings);
      } catch (reason) {
        error(file, reason);
      }
    };
    for (const target of options.targets?.length
      ? options.targets
      : [path.join(webRoot, "src")])
      await scan(path.resolve(cwd, target), true);
    if (
      !report.files.length &&
      !report.skippedFiles.length &&
      !report.errors.length
    )
      error(cwd, "没有找到可检查的 .vue 文件");
  }
  report.summary = {
    scannedFiles: report.files.length,
    skippedFiles: report.skippedFiles.length,
    findings: report.findings.length,
    errors: report.errors.length,
    pendingReview: report.files.reduce(
      (count, file) => count + file.notices.length,
      0,
    ),
    usedComponents: [
      ...new Set(report.files.flatMap((file) => file.usedComponents)),
    ].sort(),
  };
  return report;
}

const help = `组件复用检查（只读，不自动修改页面）
用法：node web/scripts/checkComponentUsage.mjs [文件或目录 ...] [选项]
无路径默认扫描 web/src。传入路径相对当前工作目录。
  --only Form,Button      只检查指定的项目封装组件
  --mapping <file>        GlobalComponents 声明，默认 web/components.d.ts
  --config <file>         替代规则 JSON，默认 scripts/componentUsageRules.json
  --exclude <path>        排除文件或目录，可重复，不支持 glob
  --include-native       提醒原生 HTML 控件的潜在复用机会
  --include-wrappers     连基础封装实现一起检查（通常无需开启）
  --json                 将完整报告以 JSON 输出到 stdout
  --strict               有复用提醒时退出码为 1
  --help                 显示帮助
退出码：0=检查完成，1=严格模式发现提醒，2=参数、文件、映射或解析错误。
边界：检查 Vue HTML 模板、静态动态组件和显式运行时导入，不证明完整合规。
复杂 :is、render/JSX、运行时注册需人工检查。组件替换需核对 API，不自动修复。`;

function parseArgs(args) {
  const options = { targets: [], exclude: [], only: [] };
  const values = {
    "--mapping": "mappingFile",
    "--config": "configFile",
    "--exclude": "exclude",
    "--only": "only",
  };
  const flags = {
    "--include-native": "includeNative",
    "--include-wrappers": "includeWrappers",
    "--strict": "strict",
    "--json": "json",
    "--help": "help",
  };
  let pathsOnly = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!pathsOnly && arg === "--") {
      pathsOnly = true;
      continue;
    }
    if (!pathsOnly && values[arg]) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} 缺少值`);
      if (arg === "--exclude") options.exclude.push(value);
      else if (arg === "--only") {
        const names = value.split(",").map((s) => s.trim());
        if (names.some((s) => !s)) throw new Error("--only 需提供非空组件名");
        options.only.push(...names);
      } else options[values[arg]] = value;
    } else if (!pathsOnly && flags[arg]) options[flags[arg]] = true;
    else if (!pathsOnly && arg.startsWith("-"))
      throw new Error(`未知选项：${arg}`);
    else options.targets.push(arg);
  }
  return options;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (reason) {
    if (process.argv.includes("--json"))
      console.log(JSON.stringify({ errors: [{ message: reason.message }] }));
    else console.error(reason.message);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(help);
    return;
  }
  const report = await scanTargets(options);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(
      `组件复用检查：${report.summary.scannedFiles} 个 Vue 文件，跳过 ${report.summary.skippedFiles} 个文件/目录`,
    );
    for (const file of report.files) {
      console.log(
        `\n${file.file}\n  已引用封装：${file.usedComponents.join(", ") || "未发现静态引用（不等同于违规）"}`,
      );
      for (const item of file.findings)
        console.log(`  ${item.line}:${item.column} [提醒] ${item.message}`);
      for (const item of file.notices)
        console.log(`  ${item.line}:${item.column} [待检查] ${item.message}`);
    }
    for (const item of report.errors)
      console.error(
        `${item.file}:${item.line}:${item.column} [错误] ${item.message}`,
      );
    console.log(
      `\n共 ${report.summary.findings} 条复用提醒，${report.summary.pendingReview} 处待人工检查，${report.summary.errors} 个错误。只报告，不修改页面。`,
    );
  }
  process.exitCode = report.errors.length
    ? 2
    : options.strict && report.findings.length
      ? 1
      : 0;
}

if (
  process.argv[1] &&
  pathKey(path.resolve(process.argv[1])) === pathKey(scriptFile)
)
  await main();
