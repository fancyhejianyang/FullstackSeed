import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { init, use } from 'echarts/core.js';
import { BarChart, LineChart, PieChart } from 'echarts/charts.js';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
} from 'echarts/components.js';
import { SVGRenderer } from 'echarts/renderers.js';
use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  SVGRenderer,
]);

async function importPureTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(
    'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64')
  );
}
const { dashboardChart } = await importPureTypeScript('./dashboardChart.ts');
const { previewWidget } = await importPureTypeScript('./dashboardPreview.ts');
test('installed ECharts renders all registered chart shapes', () => {
  for (const key of [
    'agent.executionTrend',
    'catalog.distribution',
    'customer.taskTrend',
    'content.generationTrend',
    'knowledge.health',
  ]) {
    const data = previewWidget({
      widgetKey: key,
      params: { days: 7, groupBy: 'category' },
    }).data;
    const chart = init(null, null, {
      renderer: 'svg',
      ssr: true,
      width: 640,
      height: 300,
    });
    try {
      chart.setOption({ ...dashboardChart(key, data), animation: false });
      const svg = chart.renderToSVGString();
      assert.match(svg, /<svg/);
      assert.doesNotMatch(svg, /NaN/);
    } finally {
      chart.dispose();
    }
  }
});
const widget = (widgetKey, params) => ({
  instanceId: widgetKey,
  widgetKey,
  title: '测试',
  schemaVersion: 1,
  enabled: true,
  layout: { order: 0, span: 12 },
  params,
});

test('agent chart preserves missing rates and uses percentage axis', () => {
  const data = {
    labels: ['10-19'],
    series: [
      { name: '执行量', values: [0], kind: 'bar' },
      { name: '成功率', values: [null], kind: 'line', percent: true },
    ],
  };
  const option = dashboardChart('agent.executionTrend', data);
  assert.equal(option.series[1].yAxisIndex, 1);
  assert.equal(option.series[1].data[0], null);
  assert.equal(option.yAxis[1].max, 100);
  assert.equal(option.tooltip.renderMode, 'richText');
  assert.match(option.aria.label.description, /暂无数据/);
  assert.doesNotMatch(option.aria.label.description, /NaN|undefined/);
});
test('catalog is horizontal, customer statuses stack, knowledge uses a donut', () => {
  const data = { labels: ['A'], series: [{ name: '数量', values: [1] }] };
  assert.equal(
    dashboardChart('catalog.distribution', data).yAxis.type,
    'category',
  );
  assert.equal(
    dashboardChart('customer.taskTrend', data).series[0].stack,
    'tasks',
  );
  assert.equal(dashboardChart('knowledge.health', data).series[0].type, 'pie');
});
test('static previews honor metric, period and visibility parameters', () => {
  const data = previewWidget(
    widget('agent.executionTrend', {
      days: 30,
      showToken: false,
      showAverageDuration: true,
    }),
  ).data;
  assert.equal(data.labels.length, 30);
  assert.equal(data.series[0].values.length, 30);
  assert.equal(
    data.metrics.some((m) => m.key === 'tokens'),
    false,
  );
  assert.equal(
    data.metrics.some((m) => m.key === 'duration'),
    true,
  );
  assert.deepEqual(
    previewWidget(
      widget('core.metrics', { metrics: ['skuTotal'] }),
    ).data.metrics.map((m) => m.key),
    ['skuTotal'],
  );
  assert.deepEqual(
    previewWidget(
      widget('catalog.distribution', { groupBy: 'product' }),
    ).data.series.map((s) => s.name),
    ['SKU 数'],
  );
});
test('every selectable quick action has a preview without navigating', () => {
  const keys = [
    'agent',
    'apps',
    'customer',
    'knowledge',
    'product',
    'sku',
    'approvals',
    'articles',
    'contentGeneration',
    'materials',
  ];
  for (const key of keys) {
    const items = previewWidget(widget('quick.actions', { links: [key] })).data
      .items;
    assert.equal(items.length, 1);
    assert.equal(items[0].id, key);
    assert.equal(items[0].path, undefined);
  }
});
test('backend and frontend dashboard contracts stay aligned', async () => {
  const backend = await readFile(
    new URL(
      '../../../../server/src/dashboard/dashboard.types.ts',
      import.meta.url,
    ),
    'utf8',
  );
  const frontend = await readFile(
    new URL('../../api/dashboard.ts', import.meta.url),
    'utf8',
  );
  const declarations = (source) =>
    new Map(
      ts
        .createSourceFile('types.ts', source, ts.ScriptTarget.Latest, true)
        .statements.filter(
          (s) => ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s),
        )
        .map((s) => [
          s.name.text,
          s.getText().replace(/\s+/g, '').replaceAll('"', "'"),
        ]),
    );
  const a = declarations(backend),
    b = declarations(frontend);
  for (const [name, value] of a)
    assert.equal(b.get(name), value, `contract mismatch: ${name}`);
});
