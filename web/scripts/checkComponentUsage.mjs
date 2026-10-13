#!/usr/bin/env node
/** 只读文本线索采集；不做组件合规判定或自动替换。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptFile = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(scriptFile), '..');
const ignoredDirectories = new Set(['node_modules', '.git', 'dist', 'dist-ssr', 'coverage', '.vite']);
const displayPath = (file) => file.replaceAll('\\', '/');

/** 通用部分：逐行正则匹配，返回文件、命中位置及上下文。与 Vue、组件映射无关。 */
export async function collectMatches({ targets, pattern, extensions = ['.vue'], context = 2 }) {
  if (!Array.isArray(targets) || !targets.length || !(pattern instanceof RegExp)) {
    throw new Error('需要提供非空 targets 数组和 RegExp pattern');
  }
  if (!Number.isInteger(context) || context < 0) throw new Error('context 必须为非负整数');
  const matcher = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  const allowedExtensions = new Set(extensions.map((extension) => extension.toLowerCase()));
  const seen = new Set();
  const files = [];
  const skippedPaths = [];

  async function visit(target) {
    const file = path.resolve(target);
    const key = process.platform === 'win32' ? file.toLowerCase() : file;
    if (seen.has(key)) return;
    seen.add(key);
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) {
      skippedPaths.push({ file: displayPath(file), reason: '符号链接' });
    } else if (stat.isDirectory()) {
      if (ignoredDirectories.has(path.basename(file))) {
        skippedPaths.push({ file: displayPath(file), reason: '依赖或产物目录' });
        return;
      }
      for (const entry of (await fs.readdir(file)).sort()) await visit(path.join(file, entry));
    } else if (stat.isFile() && allowedExtensions.has(path.extname(file).toLowerCase())) {
      const lines = (await fs.readFile(file, 'utf8')).split(/\r?\n/);
      const matches = [];
      lines.forEach((text, index) => {
        matcher.lastIndex = 0;
        const hits = [...text.matchAll(matcher)].map((hit) => ({ text: hit[0], column: hit.index + 1 }));
        if (!hits.length) return;
        const start = Math.max(0, index - context);
        matches.push({
          line: index + 1,
          hits,
          snippet: lines.slice(start, index + context + 1).map((line, offset) => `${start + offset + 1}: ${line}`),
        });
      });
      files.push({ file: displayPath(file), matches });
    }
  }

  for (const target of targets) await visit(target);
  return { files, skippedPaths };
}

// 组件场景：读取生成声明中的本地 .vue 映射，仅作为 AI 判断时的参考资料。
async function readComponents(mapping) {
  const source = await fs.readFile(mapping, 'utf8');
  const declaration = source.match(/\binterface\s+GlobalComponents\s*\{([\s\S]*?)\}/)?.[1];
  if (!declaration) throw new Error('未找到 GlobalComponents 声明');
  const entries = [...declaration.matchAll(/(\w+)\s*:\s*typeof\s+import\(\s*['"]([^'"]+)['"]\s*\)/g)];
  const components = entries
    .filter(([, , source]) => /^(?:\.|@\/).*\.vue$/.test(source))
    .map(([, name, source]) => ({ name, source }));
  if (!components.length) throw new Error('GlobalComponents 中没有可读取的本地 .vue 映射');
  return components;
}

// 不尝试理解语法：自定义组件标签、原生表单标签及导入文本都只是待 AI 阅读的线索。
const componentPattern = /<(?:[A-Z][\w.-]*|[a-z][\w.]*-[\w.-]+|form|input|textarea|button|select|table|component)(?=[\s/>]|$)|\b(?:from\s*|import\s*\(?)\s*['"][^'"]+['"]/g;

async function main(args) {
  if (args.includes('--help')) {
    console.log(`用法：node web/scripts/checkComponentUsage.mjs [文件或目录 ...] [--json] [--mapping 声明文件]
无路径默认扫描 web/src 下的 .vue 文件；显式路径相对当前工作目录，不支持 glob。
--json     输出结构化线索，便于交给 AI
--mapping  指定 GlobalComponents 声明，默认 web/components.d.ts
仅采集文本，不判断违规、不修改文件。命中不等于需要替换，未命中不等于已复用。`);
    return;
  }
  const targets = [];
  let mapping = path.join(webRoot, 'components.d.ts');
  let json = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--json') json = true;
    else if (arg === '--mapping') {
      if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('--mapping 缺少声明文件路径');
      mapping = path.resolve(args[++index]);
    } else if (arg.startsWith('-')) throw new Error(`不支持的参数：${arg}（使用 --help 查看用法）`);
    else targets.push(arg);
  }
  const components = await readComponents(mapping);
  const result = await collectMatches({
    targets: targets.length ? targets : [path.join(webRoot, 'src')],
    pattern: componentPattern,
  });
  const report = {
    note: '只读文本线索，不是违规或替换清单。注释、字符串也可能命中；别名、动态及跨行语法可能遗漏，需 AI 阅读原文件判断。',
    mapping: displayPath(mapping),
    components,
    ...result,
    summary: {
      scannedFiles: result.files.length,
      matchedLines: result.files.reduce((total, file) => total + file.matches.length, 0),
      skippedPaths: result.skippedPaths.length,
    },
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(report.note);
  console.log(`\nGlobalComponents 本地组件映射（${report.mapping}）：`);
  for (const component of components) console.log(`  ${component.name} → ${component.source}`);
  for (const file of result.files) {
    console.log(`\n${file.file}（${file.matches.length} 处线索行）`);
    for (const match of file.matches) {
      console.log(`  第 ${match.line} 行：${match.hits.map((hit) => `${hit.text}（列 ${hit.column}）`).join('、')}`);
      console.log(match.snippet.map((line) => `    ${line}`).join('\n'));
    }
  }
  for (const skipped of result.skippedPaths) console.log(`跳过：${skipped.file}（${skipped.reason}）`);
  console.log(`\n已扫描 ${report.summary.scannedFiles} 个文件，采集 ${report.summary.matchedLines} 处线索行。`);
}

// import 此模块只导出通用函数，不触发命令行扫描。
if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`采集失败：${error.message}`);
    process.exitCode = 1;
  });
}
