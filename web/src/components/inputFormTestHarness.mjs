import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as vue from 'vue';

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const rules = {};
new Function('exports', transpile(await readFile(new URL('./inputRules.ts', import.meta.url), 'utf8')))(rules);
const setupControl = new Function('require', 'exports', transpile(
  await readFile(new URL('./formControl.ts', import.meta.url), 'utf8'),
));
export const formControlKey = Symbol('form-control');
export const uploadFormKey = Symbol('upload-form');

export async function loadSetup(file, exported) {
  const sfc = await readFile(new URL(file, import.meta.url), 'utf8');
  const source = sfc.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  return new Function(
    'require', 'exports', 'defineOptions', 'defineProps', 'withDefaults',
    'defineModel', 'defineEmits', 'defineExpose',
    transpile(`${source}\nexport { ${exported.join(', ')} };`),
  );
}

// Exercise actual SFC scripts/reactivity; this is not a browser/DOM harness.
// controlled=true keeps the child's model getter at its previous prop until flushModel().
export function harness(setup, options = {}, value = null, context = {}) {
  const props = vue.reactive({ ...options });
  const backing = vue.ref(value);
  let pendingValue;
  let hasPending = false;
  const model = context.controlled ? vue.computed({
    get: () => backing.value,
    set: (next) => { pendingValue = next; hasPending = true; },
  }) : backing;
  const events = [];
  const provided = context.provided ?? new Map();
  const exports = {};
  const scope = vue.effectScope();
  let control;
  const runtime = {
    ...vue,
    provide: (key, entry) => provided.set(key, entry),
    inject: (key, fallback) => {
      const entry = provided.get(key);
      if (key === formControlKey && entry) return {
        register: (next) => { control = next; return entry.register(next); },
      };
      return entry ?? fallback;
    },
    onBeforeUnmount: vue.onScopeDispose,
  };
  const helper = {};
  setupControl((name) => {
    if (name === 'vue') return runtime;
    if (name === 'element-plus') return {
      useFormItem: () => ({
        form: context.parentForm,
        formItem: { prop: context.formItemProp ?? '' },
      }),
    };
    throw new Error(`Unexpected control import: ${name}`);
  }, helper);
  helper.FORM_CONTROL_KEY = formControlKey;
  scope.run(() => setup(
    (name) => {
      if (name === 'vue') return runtime;
      if (name === './formControl') return helper;
      if (name === './inputRules') return rules;
      if (name === './uploadForm') return { UPLOAD_FORM_KEY: uploadFormKey };
      if (name === './componentRegistry') return { FORM_COMPONENT_MAP: {}, getFormComponent: () => null };
      if (name === '@element-plus/icons-vue') return {};
      throw new Error(`Unexpected import: ${name}`);
    }, exports, () => {}, () => props,
    (_props, defaults) => {
      for (const [key, defaultValue] of Object.entries(defaults)) {
        if (props[key] === undefined) props[key] = typeof defaultValue === 'function' ? defaultValue() : defaultValue;
      }
      return props;
    }, () => model, () => (...args) => events.push(args), () => {},
  ));
  return {
    props, model, events, provided, control, ...exports,
    flushModel() { if (hasPending) { backing.value = pendingValue; hasPending = false; } },
    stop: () => scope.stop(),
  };
}
