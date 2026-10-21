import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('./widgetOrder.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const { dropWidget, moveWidgetToIndex, getDropPosition } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(outputText).toString('base64')
);
const createWidgets = () =>
  ['a', 'b', 'c', 'd'].map((id, index) => ({
    instanceId: id,
    widgetKey: id,
    title: `板块${id}`,
    enabled: index !== 1,
    schemaVersion: 1,
    layout: { order: index * 15, span: index === 0 ? 12 : 6 },
    params: { days: 7, showToken: false },
  }));
const ids = (widgets) => widgets.map((widget) => widget.instanceId);

test('drop before and after targets works when moving forward and backward across rows', () => {
  const widgets = createWidgets();
  assert.deepEqual(ids(dropWidget(widgets, 'a', 'c', 'before')), [
    'b',
    'a',
    'c',
    'd',
  ]);
  assert.deepEqual(ids(dropWidget(widgets, 'a', 'c', 'after')), [
    'b',
    'c',
    'a',
    'd',
  ]);
  assert.deepEqual(ids(dropWidget(widgets, 'd', 'b', 'before')), [
    'a',
    'd',
    'b',
    'c',
  ]);
  assert.deepEqual(ids(dropWidget(widgets, 'd', 'b', 'after')), [
    'a',
    'b',
    'd',
    'c',
  ]);
});

test('first and last positions are reachable', () => {
  const widgets = createWidgets();
  assert.deepEqual(ids(dropWidget(widgets, 'd', 'a', 'before')), [
    'd',
    'a',
    'b',
    'c',
  ]);
  assert.deepEqual(ids(dropWidget(widgets, 'a', 'd', 'after')), [
    'b',
    'c',
    'd',
    'a',
  ]);
});

test('same position, self and missing ids leave the original reference untouched (no dirty state)', () => {
  const widgets = createWidgets();
  for (const [from, to, position] of [
    ['a', 'a', 'before'],
    ['a', 'a', 'after'],
    ['a', 'b', 'before'],
    ['b', 'a', 'after'],
    ['unknown', 'b', 'before'],
    ['a', 'unknown', 'after'],
  ])
    assert.equal(dropWidget(widgets, from, to, position), widgets);
});

test('moves reindex the persisted order without changing settings or enabled state', () => {
  const widgets = createWidgets();
  const initial = JSON.stringify(widgets);
  const next = dropWidget(widgets, 'a', 'd', 'after');
  assert.deepEqual(
    next.map((widget) => widget.layout.order),
    [0, 10, 20, 30],
  );
  assert.equal(JSON.stringify(widgets), initial);
  for (const moved of next) {
    const original = widgets.find(
      (widget) => widget.instanceId === moved.instanceId,
    );
    assert.deepEqual({ ...moved, layout: original.layout }, original);
    assert.equal(moved.layout.span, original.layout.span);
    assert.notEqual(moved.layout, original.layout);
  }
});

test('up/down buttons use the same persisted ordering as drag and drop', () => {
  const widgets = createWidgets();
  assert.deepEqual(
    moveWidgetToIndex(widgets, 1, 0),
    dropWidget(widgets, 'b', 'a', 'before'),
  );
  assert.deepEqual(
    moveWidgetToIndex(widgets, 1, 2),
    dropWidget(widgets, 'b', 'c', 'after'),
  );
});

test('invalid and boundary move attempts cannot drop a widget', () => {
  const widgets = createWidgets();
  for (const [from, to] of [
    [0, -1],
    [3, 4],
    [-1, 0],
    [4, 0],
    [0.5, 1],
    [1, NaN],
    [0, 0],
  ]) {
    assert.equal(moveWidgetToIndex(widgets, from, to), widgets);
  }
  const empty = [];
  assert.equal(dropWidget(empty, 'a', 'b', 'before'), empty);
});

test('multi-column grid uses left/right halves regardless of pointer height', () => {
  const bounds = { left: 100, top: 40, width: 320, height: 450 };
  assert.equal(
    getDropPosition(bounds, { x: 259, y: 480 }, 'horizontal'),
    'before',
  );
  assert.equal(
    getDropPosition(bounds, { x: 260, y: 41 }, 'horizontal'),
    'after',
  );
});

test('single-column grid uses top/bottom halves regardless of pointer width', () => {
  const bounds = { left: 100, top: 40, width: 320, height: 450 };
  assert.equal(
    getDropPosition(bounds, { x: 419, y: 264 }, 'vertical'),
    'before',
  );
  assert.equal(
    getDropPosition(bounds, { x: 101, y: 265 }, 'vertical'),
    'after',
  );
});
