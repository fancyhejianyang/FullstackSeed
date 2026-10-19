import type {
  WidgetConfig,
  DashboardWidget,
  WidgetData,
} from '@/api/dashboard';
export function previewWidget(widget: WidgetConfig): DashboardWidget {
  const count = widget.params.days === 30 ? 30 : 7;
  const labels = Array.from({ length: count }, (_, i) => `${i + 1}日`);
  const samples = (values: number[]) =>
    Array.from({ length: count }, (_, i) => values[i % values.length]!);
  let data: WidgetData;
  switch (widget.widgetKey) {
    case 'core.metrics':
      data = {
        metrics: [
          { key: 'agentTotal', label: '今日执行', value: 128, unit: '次' },
          { key: 'agentRate', label: '今日成功率', value: 96.2, unit: '%' },
          { key: 'waitingHuman', label: '等待人工', value: 2 },
          { key: 'pendingApprovals', label: '待审批', value: 3 },
          { key: 'productTotal', label: '产品总数', value: 86 },
          { key: 'skuTotal', label: 'SKU 总数', value: 412 },
        ].filter((x) => (widget.params.metrics as string[]).includes(x.key)),
      };
      break;
    case 'agent.executionTrend':
      data = {
        labels,
        metrics: [
          { key: 'agentTotal', label: '执行总数', value: 541, unit: '次' },
          { key: 'agentRate', label: '成功率', value: 96.2, unit: '%' },
          ...(widget.params.showToken
            ? [{ key: 'tokens', label: '已记录 Token', value: 128600 }]
            : []),
          ...(widget.params.showAverageDuration
            ? [
                {
                  key: 'duration',
                  label: '平均模型耗时',
                  value: 820,
                  unit: 'ms',
                },
              ]
            : []),
        ],
        series: [
          {
            name: '执行量',
            values: samples([40, 65, 52, 89, 72, 95, 128]),
            kind: 'bar',
          },
          {
            name: '成功率',
            values: samples([95, 98, 96, 99, 96, 97, 96.2]),
            kind: 'line',
            percent: true,
          },
        ],
      };
      break;
    case 'catalog.distribution':
      data = {
        labels:
          widget.params.groupBy === 'product'
            ? ['商务笔记本', '办公打印机', '无线键盘']
            : ['电子产品', '办公用品', '生活用品'],
        series: [
          ...(widget.params.groupBy === 'product'
            ? []
            : [{ name: '产品数', values: [12, 8, 16] }]),
          { name: 'SKU 数', values: [68, 31, 44] },
        ],
      };
      break;
    case 'customer.taskTrend':
      data = {
        labels,
        series: [
          { name: '完成', values: samples([12, 23, 35, 20, 31, 43, 38]) },
          { name: '失败', values: samples([1, 2, 1, 0, 2, 1, 1]) },
          { name: '取消 / 过期', values: samples([0, 1, 2, 0, 1, 0, 2]) },
          { name: '进行中', values: samples([0, 0, 0, 0, 0, 0, 3]) },
        ],
      };
      break;
    case 'knowledge.health':
      data = {
        labels: ['可用', '处理中', '待处理 / 停用', '异常', '未识别'],
        series: [{ name: '知识库记录', values: [72, 8, 12, 3, 0] }],
      };
      break;
    case 'business.health':
      data = {
        metrics: [
          { key: 'agentTotal', label: '今日执行', value: 128 },
          { key: 'agentRate', label: '今日成功率', value: 96.2, unit: '%' },
          { key: 'apps', label: '启用 Agent', value: 5, hint: '共 6 个应用' },
          { key: 'waitingHuman', label: '等待人工', value: 2 },
          { key: 'pendingApprovals', label: '待审批', value: 3 },
          {
            key: 'knowledge',
            label: '可用知识库',
            value: 72,
            hint: '共 95 条记录',
          },
          { key: 'products', label: '产品总数', value: 86 },
          { key: 'skus', label: 'SKU 总数', value: 412 },
        ],
      };
      break;
    case 'operations.todo':
      data = {
        items: [
          { id: '1', title: '客服会话 #203', detail: '等待人工接待' },
          { id: '2', title: '产品说明文档', detail: '知识处理异常' },
          { id: '3', title: '售后问题标准问答', detail: '待审批' },
        ],
      };
      break;
    case 'activity.recent':
      data = {
        items: [
          { id: '1', title: '产品库', detail: '管理员 · 新增记录' },
          { id: '2', title: 'Agent 应用', detail: '管理员 · 更新配置' },
        ],
      };
      break;
    default:
      data = {
        items: [
          { id: 'agent', title: 'Agent 工作台', detail: '进入模块' },
          { id: 'apps', title: 'Agent 应用', detail: '进入模块' },
          { id: 'customer', title: '客服工作台', detail: '进入模块' },
          { id: 'knowledge', title: '知识库', detail: '进入模块' },
          { id: 'product', title: '产品库', detail: '进入模块' },
          { id: 'sku', title: 'SKU 库', detail: '进入模块' },
          { id: 'approvals', title: '审批管理', detail: '进入模块' },
        ].filter((x) => (widget.params.links as string[]).includes(x.id)),
      };
  }
  return { ...widget, status: 'ready', data };
}
