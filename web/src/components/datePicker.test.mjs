import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import * as vue from 'vue';
import { parse, compileTemplate } from '@vue/compiler-sfc';

const sources = Object.fromEntries(await Promise.all(
  ['DatePicker', 'DateRange'].map(async (kind) => [
    kind,
    await readFile(new URL(`./${kind}.vue`, import.meta.url), 'utf8'),
  ]),
));

function harness(kind, options = {}, initialValue = kind === 'DateRange' ? [] : '') {
  const props = vue.reactive({ ...options });
  const model = vue.ref(initialValue);
  const source = parse(sources[kind]).descriptor.scriptSetup.content;
  const exports = {};
  const code = ts.transpileModule(
    `${source}\nexport { pickerValue, displayFormat, modelFormat${kind === 'DateRange' ? ', normalizeRange' : ''} };`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  new Function('require', 'exports', 'defineOptions', 'defineProps', 'withDefaults', 'defineModel', 'defineEmits', code)(
    (name) => {
      if (name === 'vue') return vue;
      throw new Error(`Unexpected import ${name}`);
    },
    exports,
    () => {},
    () => props,
    (current, defaults) => {
      for (const [key, value] of Object.entries(defaults))
        if (current[key] === undefined) current[key] = typeof value === 'function' ? value() : value;
      return current;
    },
    () => model,
    () => () => {},
  );
  return { ...exports, props, model };
}

for (const kind of Object.keys(sources)) {
  const dateType = kind === 'DateRange' ? 'daterange' : 'date';
  const timeType = kind === 'DateRange' ? 'datetimerange' : 'datetime';
  test(`${kind}: time types retain seconds by default and react to a type change`, () => {
    const h = harness(kind, { type: dateType });
    assert.equal(h.displayFormat.value, 'YYYY-MM-DD');
    assert.equal(h.modelFormat.value, 'YYYY-MM-DD');
    h.props.type = timeType;
    assert.equal(h.displayFormat.value, 'YYYY-MM-DD HH:mm:ss');
    assert.equal(h.modelFormat.value, 'YYYY-MM-DD HH:mm:ss');
    const value = kind === 'DateRange'
      ? ['2026-10-29 09:15:23', '2026-10-30 18:40:56']
      : '2026-10-29 09:15:23';
    h.pickerValue.value = value;
    assert.deepEqual(h.model.value, value);
  });

  test(`${kind}: explicit display and storage formats override defaults independently`, () => {
    const h = harness(kind, { type: timeType, format: 'DD/MM/YYYY HH:mm' });
    assert.equal(h.displayFormat.value, 'DD/MM/YYYY HH:mm');
    assert.equal(h.modelFormat.value, 'YYYY-MM-DD HH:mm:ss');
    h.props.valueFormat = 'YYYY-MM-DDTHH:mm:ss';
    h.props.type = dateType;
    assert.equal(h.modelFormat.value, 'YYYY-MM-DDTHH:mm:ss');
    assert.equal(h.displayFormat.value, 'DD/MM/YYYY HH:mm');
  });

  test(`${kind}: clearing and parent resets retain the model contract`, () => {
    const value = kind === 'DateRange' ? ['2026-10-29', '2026-10-30'] : '2026-10-29';
    const h = harness(kind, {}, value);
    for (const empty of [null, undefined]) {
      h.pickerValue.value = empty;
      assert.deepEqual(h.model.value, kind === 'DateRange' ? [] : null);
      h.model.value = value;
      assert.deepEqual(h.pickerValue.value, value);
    }
    if (kind === 'DateRange') {
      assert.deepEqual(h.normalizeRange(null), []);
      assert.deepEqual(h.normalizeRange(value), value);
    }
  });

  test(`${kind}: template binds the normalized model and computed formats`, () => {
    const { descriptor } = parse(sources[kind]);
    const template = descriptor.template.content;
    assert.match(template, /v-model="pickerValue"/);
    assert.match(template, /:format="displayFormat"/);
    assert.match(template, /:value-format="modelFormat"/);
    assert.deepEqual(compileTemplate({ source: template, filename: `${kind}.vue`, id: kind }).errors, []);
    if (kind === 'DateRange') assert.match(template, /normalizeRange\(\$event\)/);
  });
}
