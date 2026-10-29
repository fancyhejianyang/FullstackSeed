import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import * as vue from 'vue';
import { parse, compileTemplate } from '@vue/compiler-sfc';

// 真实组件脚本与 Vue 响应式 + 可控布局桩；不启动服务，不代替浏览器视觉验收。
const read = (file) => readFile(new URL(file, import.meta.url), 'utf8');
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
function loadModule(
  source,
  require = () => {
    throw new Error('Unexpected import');
  },
) {
  const exports = {};
  new Function('require', 'exports', transpile(source))(require, exports);
  return exports;
}
const positionModule = loadModule(await read('./selectDropdownPosition.ts'));
const { getSelectDropdownPosition: position } = positionModule;
const hookSource = await read('./useSelectDropdown.ts');
const displayModule = loadModule(await read('./selectDisplay.ts'));
const sources = {
  Select: await read('./Select.vue'),
  SelectMultiple: await read('./SelectMultiple.vue'),
};
const viewport = { left: 0, top: 0, width: 800, height: 600 };
const rect = (left = 100, top = 100, width = 240, height = 32) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

test('dropdown escapes the short Dialog body and aligns below its control', () => {
  assert.deepEqual(position(rect(), 102, viewport), {
    left: 100,
    top: 136,
    width: 240,
    height: 102,
    placement: 'bottom',
  });
});
test('dropdown flips above a bottom composer and limits height on short screens', () => {
  assert.deepEqual(position(rect(100, 550), 272, viewport), {
    left: 100,
    top: 272,
    width: 240,
    height: 272,
    placement: 'top',
  });
  const result = position(rect(100, 130), 272, { ...viewport, height: 280 });
  assert.equal(result.placement, 'top');
  assert.equal(result.height, 116);
  assert.equal(result.top, 8);
});
test('horizontal boundaries, narrow screens and visual viewport offsets are respected', () => {
  assert.equal(position(rect(700), 102, viewport).left, 552);
  assert.equal(position(rect(-100), 102, viewport).left, 8);
  assert.equal(position(rect(), 102, { ...viewport, width: 180 }).width, 164);
  const result = position(rect(100, 550), 272, {
    left: 50,
    top: 200,
    width: 300,
    height: 400,
  });
  assert.equal(result.left, 100);
  assert.equal(result.top, 272);
});

class Target extends EventTarget {
  listeners = new Map();
  addEventListener(type, handler, options) {
    super.addEventListener(type, handler, options);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler, options) {
    super.removeEventListener(type, handler, options);
    this.listeners.get(type)?.delete(handler);
  }
  fire(type, target = this) {
    for (const handler of this.listeners.get(type) ?? []) handler({ target });
  }
  count() {
    return [...this.listeners.values()].reduce((n, set) => n + set.size, 0);
  }
}
class Element extends Target {
  constructor(bounds = rect(), parentElement = null, style = {}) {
    super();
    this.bounds = bounds;
    this.parentElement = parentElement;
    this.style = {
      overflowX: 'visible',
      overflowY: 'visible',
      zIndex: 'auto',
      ...style,
    };
    this.hidden = false;
    this.scrollTop = 0;
    this.clientHeight = 68;
  }
  getBoundingClientRect() {
    return this.bounds;
  }
  getClientRects() {
    return this.hidden ? [] : [this.bounds];
  }
  contains(target) {
    for (let node = target; node; node = node.parentElement)
      if (node === this) return true;
    return false;
  }
  focus() {}
}

function harness(
  kind = 'Select',
  options = {},
  value = kind === 'Select' ? '' : [],
  deferredModelWrite = false,
) {
  const original = Object.fromEntries(
    ['window', 'document', 'Node', 'ResizeObserver', 'getComputedStyle'].map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
    ),
  );
  const browser = new Target();
  const doc = new Target();
  const frames = new Map();
  const observers = [];
  let frameId = 0;
  let zIndex = 2000;
  Object.assign(browser, {
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    visualViewport: Object.assign(new Target(), {
      offsetLeft: 0,
      offsetTop: 0,
      width: 800,
      height: 600,
    }),
  });
  doc.documentElement = { clientWidth: 800, clientHeight: 600 };
  Object.assign(globalThis, {
    window: browser,
    document: doc,
    Node: Element,
    getComputedStyle: (element) => element.style,
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(target) {
        this.target = target;
      }
      disconnect() {
        this.disconnected = true;
      }
    },
  });
  const mounted = [],
    unmounted = [],
    deactivated = [];
  const runtime = {
    ...vue,
    onMounted: (fn) => mounted.push(fn),
    onBeforeUnmount: (fn) => unmounted.push(fn),
    onDeactivated: (fn) => deactivated.push(fn),
  };
  const form = vue.reactive({ disabled: false });
  const validations = [];
  const ep = {
    useZIndex: () => ({ nextZIndex: () => ++zIndex }),
    useFormItem: () => ({
      form,
      formItem: {
        validate: async (trigger) => {
          validations.push({
            trigger,
            value: Array.isArray(model.value) ? [...model.value] : model.value,
          });
          return true;
        },
      },
    }),
  };
  const hook = loadModule(hookSource, (name) => {
    if (name === 'vue') return runtime;
    if (name === 'element-plus') return ep;
    if (name === './selectDropdownPosition') return positionModule;
    throw new Error(`Unexpected import ${name}`);
  });
  const exposed = [
    'rootRef',
    'dropdownRef',
    'inputRef',
    'menuRef',
    'opened',
    'dropdownStyle',
    'dropdownHeight',
    'menuHeight',
    'open',
    'close',
    'handleKeydown',
    'handleDocumentClick',
    'highlightedIndex',
    'filteredOptions',
    'clearValue',
    'handleInput',
    'handleBlur',
    ...(kind === 'SelectMultiple' ? ['removeValue'] : []),
    kind === 'Select' ? 'selectOption' : 'toggleOption',
  ];
  const source = sources[kind].match(
    /<script setup lang="ts">([\s\S]*?)<\/script>/,
  )[1];
  const setup = new Function(
    'require',
    'exports',
    'defineOptions',
    'defineProps',
    'withDefaults',
    'defineModel',
    'defineEmits',
    transpile(`${source}\nexport { ${exposed.join(', ')} };`),
  );
  const scope = vue.effectScope();
  const props = vue.reactive({
    options: [
      { value: '4', text: '4 / 12' },
      { value: '6', text: '6 / 12' },
      { value: '12', text: '整行' },
    ],
    ...options,
  });
  const model = vue.ref(value);
  const modelBinding = deferredModelWrite
    ? vue.computed({
        get: () => model.value,
        set: (next) => { void vue.nextTick(() => { model.value = next; }); },
      })
    : model;
  const events = [];
  const exports = {};
  scope.run(() =>
    setup(
      (name) => {
        if (name === 'vue') return runtime;
        if (name === 'element-plus') return ep;
        if (name === './selectDisplay') return displayModule;
        if (name === './useSelectDropdown') return hook;
        throw new Error(`Unexpected import ${name}`);
      },
      exports,
      () => {},
      () => props,
      (current, defaults) => {
        for (const [key, value] of Object.entries(defaults))
          if (current[key] === undefined)
            current[key] = typeof value === 'function' ? value() : value;
        return current;
      },
      () => modelBinding,
      () =>
        (...args) =>
          events.push(args),
    ),
  );
  const dialog = new Element(rect(30, 30, 600, 180), null, {
    overflowY: 'auto',
    zIndex: '3000',
  });
  const root = vue.markRaw(new Element(rect(), dialog));
  const dropdown = vue.markRaw(new Element());
  exports.rootRef.value = root;
  exports.dropdownRef.value = dropdown;
  exports.menuRef.value = vue.markRaw(new Element(rect(), dropdown));
  exports.inputRef.value = vue.markRaw(new Element(rect(), root));
  mounted.forEach((fn) => fn());
  function flushFrame() {
    for (const [id, fn] of frames) {
      frames.delete(id);
      fn();
    }
  }
  function stop() {
    scope.stop();
    unmounted.forEach((fn) => fn());
  }
  function restore() {
    stop();
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
  return {
    ...exports,
    props,
    form,
    validations,
    model,
    events,
    browser,
    doc,
    dialog,
    root,
    dropdown,
    frames,
    observers,
    flushFrame,
    stop,
    restore,
    deactivate: () => deactivated.forEach((fn) => fn()),
  };
}

test('SelectMultiple: change carries the next array before a controlled parent writes it back', async () => {
  const h = harness('SelectMultiple', {}, ['4'], true);
  try {
    h.toggleOption(h.props.options[1]);
    assert.deepEqual(h.model.value, ['4']);
    assert.deepEqual(h.events.at(-1), ['change', ['4', '6']]);
    await vue.nextTick();
    assert.deepEqual(h.validations.at(-1), { trigger: 'change', value: ['4', '6'] });
    h.removeValue('4', { stopPropagation() {} });
    assert.deepEqual(h.events.at(-1), ['change', ['6']]);
    await vue.nextTick();
    assert.deepEqual(h.model.value, ['6']);
  } finally {
    h.restore();
  }
});

for (const kind of Object.keys(sources)) {
  test(`${kind}: template teleports its fixed dropdown, retains focus on menu mousedown and compiles`, () => {
    const { descriptor } = parse(sources[kind]);
    const template = descriptor.template.content;
    assert.match(
      template,
      /<Teleport to="body">[\s\S]*ref="dropdownRef"[\s\S]*@mousedown\.prevent/,
    );
    assert.match(template, /dropdownHeight/);
    assert.match(
      descriptor.styles[0].content,
      /__dropdown\s*\{\s*position: fixed/,
    );
    assert.deepEqual(
      compileTemplate({ source: template, filename: `${kind}.vue`, id: kind })
        .errors,
      [],
    );
  });
  test(`${kind}: positioned above Dialog z-index, follows scroll/resize and cleans listeners`, async () => {
    const h = harness(kind);
    try {
      h.open();
      await vue.nextTick();
      assert.equal(h.dropdownStyle.value.top, '136px');
      assert.equal(h.dropdownStyle.value.zIndex, 3001);
      assert.equal(h.dropdownHeight.value, 102);
      h.root.bounds = rect(140, 120, 280);
      h.browser.fire('scroll', h.dialog);
      h.browser.fire('resize');
      assert.equal(h.frames.size, 1);
      h.flushFrame();
      assert.equal(h.dropdownStyle.value.top, '156px');
      assert.equal(h.dropdownStyle.value.width, '280px');
      h.browser.fire('scroll', h.menuRef.value);
      assert.equal(h.frames.size, 0);
      h.root.bounds = rect(140, 120, 300);
      h.observers[0].callback();
      h.flushFrame();
      assert.equal(h.dropdownStyle.value.width, '300px');
      h.props.options = [];
      await vue.nextTick();
      assert.equal(
        h.dropdownHeight.value,
        34,
        'empty state must retain one visible row',
      );
      h.props.options = Array.from({ length: 20 }, (_, i) => ({
        value: String(i),
        text: `选项 ${i}`,
      }));
      h.dialog.bounds = rect(30, 30, 600, 550);
      h.browser.visualViewport.height = 280;
      h.browser.visualViewport.fire('resize');
      await vue.nextTick();
      h.flushFrame();
      assert.equal(
        h.dropdownHeight.value,
        114,
        'visual viewport resize constrains the menu',
      );
      h.close();
      await vue.nextTick();
      assert.equal(h.browser.listeners.get('scroll').size, 0);
      assert.equal(h.browser.listeners.get('resize').size, 0);
      assert.equal(h.browser.visualViewport.count(), 0);
      assert.equal(h.observers[0].disconnected, true);
      h.open();
      await vue.nextTick();
      h.browser.fire('resize');
      h.stop();
      assert.equal(h.frames.size, 0);
      assert.equal(h.browser.count(), 0);
      assert.equal(h.doc.count(), 0);
    } finally {
      h.restore();
    }
  });
  test(`${kind}: body menu clicks remain internal, outside clicks and window blur close`, async () => {
    const h = harness(kind);
    try {
      h.open();
      await vue.nextTick();
      h.handleDocumentClick({ target: new Element(rect(), h.dropdown) });
      assert.equal(h.opened.value, true);
      const option = h.props.options[1];
      if (kind === 'Select') {
        h.selectOption(option);
        assert.equal(h.model.value, '6');
        assert.equal(h.opened.value, false);
      } else {
        h.toggleOption(option);
        assert.deepEqual(h.model.value, ['6']);
        assert.equal(h.opened.value, true);
        h.handleDocumentClick({ target: new Element(rect(), h.dropdown) });
        h.toggleOption(option);
        assert.deepEqual(h.model.value, []);
        assert.equal(h.opened.value, true);
      }
      h.open();
      h.handleDocumentClick({ target: new Element() });
      assert.equal(h.opened.value, false);
      h.open();
      h.browser.fire('blur');
      assert.equal(h.opened.value, false);
    } finally {
      h.restore();
    }
  });
  test(`${kind}: keyboard works in constrained non-virtual lists; Escape does not close Dialog`, async () => {
    const h = harness(kind, { virtual: false });
    try {
      const key = (name) => {
        const event = new Event('keydown', { cancelable: true });
        Object.defineProperty(event, 'key', { value: name });
        let stopped = false;
        event.stopPropagation = () => {
          stopped = true;
        };
        h.handleKeydown(event);
        return { event, stopped };
      };
      key('ArrowDown');
      await vue.nextTick();
      key('ArrowDown');
      key('ArrowDown');
      assert.equal(h.menuRef.value.scrollTop, 34);
      key('Enter');
      assert.deepEqual(h.model.value, kind === 'Select' ? '12' : ['12']);
      h.open();
      const escape = key('Escape');
      assert.equal(h.opened.value, false);
      assert.equal(escape.event.defaultPrevented, true);
      assert.equal(escape.stopped, true);
      h.open();
      const tab = key('Tab');
      assert.equal(h.opened.value, false);
      assert.equal(tab.event.defaultPrevented, false);
    } finally {
      h.restore();
    }
  });
  test(`${kind}: closes when anchor scrolls out, becomes disabled or component deactivates`, async () => {
    const h = harness(kind);
    try {
      h.open();
      await vue.nextTick();
      h.root.bounds = rect(100, 220);
      h.browser.fire('scroll', h.dialog);
      h.flushFrame();
      assert.equal(h.opened.value, false);
      await vue.nextTick();
      h.root.bounds = rect();
      h.open();
      await vue.nextTick();
      h.props.disabled = true;
      await vue.nextTick();
      assert.equal(h.opened.value, false);
      h.props.disabled = false;
      await vue.nextTick();
      h.open();
      await vue.nextTick();
      h.deactivate();
      assert.equal(h.opened.value, false);
      assert.equal(h.browser.listeners.get('scroll').size, 0);
    } finally {
      h.restore();
    }
  });
  test(`${kind}: disabled options and virtual-list keyboard selection remain intact`, async () => {
    const h = harness(kind, {
      options: Array.from({ length: 20 }, (_, i) => ({
        value: String(i),
        text: `选项 ${i}`,
        disabled: i === 1,
      })),
      maxSelections: 1,
    });
    try {
      h.open();
      await vue.nextTick();
      const choose = kind === 'Select' ? h.selectOption : h.toggleOption;
      choose(h.props.options[1]);
      assert.deepEqual(h.model.value, kind === 'Select' ? '' : []);
      for (let i = 0; i < 10; i++)
        h.handleKeydown({ key: 'ArrowDown', preventDefault() {} });
      assert.equal(h.menuRef.value.scrollTop, 306);
      h.handleKeydown({ key: 'Enter', preventDefault() {} });
      assert.deepEqual(h.model.value, kind === 'Select' ? '10' : ['10']);
      if (kind === 'SelectMultiple') {
        choose(h.props.options[2]);
        assert.deepEqual(
          h.model.value,
          ['10'],
          'maximum selection count is preserved',
        );
        choose(h.props.options[10]);
        assert.deepEqual(h.model.value, []);
      }
    } finally {
      h.restore();
    }
  });

  for (const lockSource of ['form', 'disabled', 'readonly']) {
    test(`${kind}: ${lockSource} prevents stale menu, clear, keyboard and search mutations`, async () => {
      const initialValue = kind === 'Select' ? '4' : ['4'];
      const h = harness(kind, {}, initialValue);
      try {
        h.open();
        await vue.nextTick();
        if (lockSource === 'form') h.form.disabled = true;
        else h.props[lockSource] = true;
        assert.equal(h.opened.value, false, 'locking closes an open menu immediately');
        h.open();
        h.handleInput({ target: { value: '整行' } });
        h.handleKeydown({ key: 'ArrowDown', preventDefault() {} });
        const choose = kind === 'Select' ? h.selectOption : h.toggleOption;
        choose(h.props.options[1]);
        h.clearValue({ stopPropagation() {} });
        if (kind === 'SelectMultiple') h.removeValue('4', { stopPropagation() {} });
        await vue.nextTick();
        assert.equal(h.opened.value, false);
        assert.deepEqual(h.model.value, initialValue);
        assert.deepEqual(h.events, []);
        assert.deepEqual(h.validations, []);

        if (lockSource === 'form') h.form.disabled = false;
        else h.props[lockSource] = false;
        h.open();
        choose(h.props.options[1]);
        assert.deepEqual(h.model.value, kind === 'Select' ? '6' : ['4', '6']);
      } finally {
        h.restore();
      }
    });
  }

  test(`${kind}: validates change/clear/blur after the model update; validateEvent can opt out`, async () => {
    const h = harness(kind);
    try {
      const choose = kind === 'Select' ? h.selectOption : h.toggleOption;
      choose(h.props.options[0]);
      assert.deepEqual(h.validations, [], 'validation waits for parent v-model writes');
      await vue.nextTick();
      assert.deepEqual(h.validations.shift(), {
        trigger: 'change', value: kind === 'Select' ? '4' : ['4'],
      });
      if (kind === 'SelectMultiple') {
        h.removeValue('4', { stopPropagation() {} });
        await vue.nextTick();
        assert.deepEqual(h.validations.shift(), { trigger: 'change', value: [] });
        choose(h.props.options[1]);
        await vue.nextTick();
        h.validations.length = 0;
      }
      h.clearValue({ stopPropagation() {} });
      await vue.nextTick();
      assert.deepEqual(h.validations.shift(), {
        trigger: 'change', value: kind === 'Select' ? '' : [],
      });
      h.handleBlur();
      await vue.nextTick();
      assert.equal(h.validations.shift().trigger, 'blur');
      h.props.validateEvent = false;
      choose(h.props.options[0]);
      h.handleBlur();
      await vue.nextTick();
      assert.deepEqual(h.validations, []);
    } finally {
      h.restore();
    }
  });
}
