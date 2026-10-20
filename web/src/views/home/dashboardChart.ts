import type { EChartsOption } from 'echarts';
import type { WidgetData } from '@/api/dashboard';
export function dashboardChart(key: string, data: WidgetData): EChartsOption {
  const colors =
    key === 'knowledge.health'
      ? ['#67c23a', '#409eff', '#e6a23c', '#f56c6c', '#909399']
      : key === 'customer.taskTrend'
        ? ['#67c23a', '#f56c6c', '#909399', '#409eff', '#606266']
        : ['#409eff', '#67c23a', '#e6a23c', '#909399'];
  const common: EChartsOption = {
    color: colors,
    aria: {
      enabled: true,
      label: {
        description: (data.series ?? [])
          .map(
            (series) =>
              series.name +
              '：' +
              (data.labels ?? [])
                .map(
                  (label, index) =>
                    label + ' ' + (series.values[index] ?? '暂无数据'),
                )
                .join('，'),
          )
          .join('；'),
      },
    },
    tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
    legend: { bottom: 0, textStyle: { color: '#606266' } },
    grid: {
      left: 45,
      right: 42,
      top: 24,
      bottom: 58,
      outerBoundsMode: 'same',
      outerBoundsContain: 'axisLabel',
    },
  };
  if (key === 'knowledge.health')
    return {
      ...common,
      tooltip: { trigger: 'item', renderMode: 'richText' },
      legend: { bottom: 0 },
      series: [
        {
          name: '知识库记录',
          type: 'pie',
          radius: ['43%', '68%'],
          center: ['50%', '43%'],
          label: { show: false },
          data: (data.labels ?? []).map((name, i) => ({
            name,
            value: data.series?.[0]?.values[i] ?? 0,
          })),
        },
      ],
    };
  const horizontal = key === 'catalog.distribution';
  const categories = {
    type: 'category' as const,
    data: data.labels ?? [],
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#dcdfe6' } },
    axisLabel: { color: '#606266', width: 100, overflow: 'truncate' as const },
  };
  const values = {
    type: 'value' as const,
    minInterval: 1,
    splitLine: { lineStyle: { color: '#eef0f4' } },
    axisLabel: { color: '#606266' },
  };
  return {
    ...common,
    xAxis: horizontal ? values : categories,
    yAxis: horizontal
      ? categories
      : data.series?.some((s) => s.percent)
        ? [
            values,
            {
              ...values,
              max: 100,
              min: 0,
              axisLabel: { formatter: '{value}%' },
            },
          ]
        : values,
    series: (data.series ?? []).map((s) => ({
      name: s.name,
      type: s.kind ?? 'bar',
      data: s.values,
      ...(!horizontal ? { yAxisIndex: s.percent ? 1 : 0 } : {}),
      barMaxWidth: 24,
      stack:
        key === 'customer.taskTrend' || key === 'generation.health'
          ? 'tasks'
          : undefined,
      smooth: false,
      connectNulls: false,
    })),
  };
}
