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
          { key: 'contentTotal', label: '内容创作数', value: 24 },
          {
            key: 'materialTotal',
            label: 'AI 素材数',
            value: 38,
            hint: '图片 29 · 视频 9',
          },
          { key: 'generationTotal', label: '生成记录数', value: 67 },
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
    case 'content.generationTrend': {
      const source = String(widget.params.source ?? 'all');
      const mediaType = String(widget.params.mediaType ?? 'all');
      const byMedia = widget.params.viewMode === 'mediaType';
      const sourceSeries = [
        {
          key: 'content',
          name: '文章创作',
          media: 'article',
          values: samples([3, 5, 4, 8, 6, 7, 9]),
        },
        {
          key: 'aiMaterial',
          name: '云端 AI 素材',
          media: 'image',
          values: samples([2, 4, 3, 5, 4, 6, 7]),
        },
        {
          key: 'comfyui',
          name: 'ComfyUI',
          media: 'video',
          values: samples([1, 2, 1, 3, 2, 4, 3]),
        },
      ].filter(
        (item) =>
          (source === 'all' || source === item.key) &&
          (mediaType === 'all' || mediaType === item.media),
      );
      const mediaSeries = [
        {
          key: 'article',
          name: '文章',
          values: samples([3, 5, 4, 8, 6, 7, 9]),
        },
        {
          key: 'image',
          name: '图片',
          values: samples([2, 4, 3, 5, 4, 6, 7]),
        },
        {
          key: 'video',
          name: '视频',
          values: samples([1, 2, 1, 3, 2, 4, 3]),
        },
      ].filter(
        (item) =>
          (mediaType === 'all' || mediaType === item.key) &&
          (source === 'all' ||
            (source === 'content'
              ? item.key === 'article'
              : item.key !== 'article')),
      );
      data = {
        labels,
        metrics: [
          {
            key: 'generationTotal',
            label: '生成记录',
            value: count === 30 ? 186 : 47,
            unit: '次',
            hint: `${count} 天内`,
          },
          {
            key: 'generationRate',
            label: '生成成功率',
            value: 94.1,
            unit: '%',
            hint: '成功 32 · 已终止 2',
          },
          {
            key: 'generationWaiting',
            label: '待处理任务',
            value: 3,
            unit: '个',
            hint: '含待补充素材',
          },
        ],
        series: (byMedia ? mediaSeries : sourceSeries).map((item) => ({
          name: item.name,
          values: item.values,
          kind: 'bar',
        })),
      };
      break;
    }
    case 'generation.health': {
      const source = String(widget.params.source ?? 'all');
      const mediaType = String(widget.params.mediaType ?? 'all');
      data = {
        labels: [
          '等待',
          '运行',
          '存储 / 归档',
          '待补充',
          '成功',
          '失败 / 中断',
          '未识别',
        ],
        metrics: [
          {
            key: 'activeGeneration',
            label: '处理中',
            value: 5,
            unit: '个',
          },
          {
            key: 'failedGeneration',
            label: '失败与异常',
            value: 2,
            unit: '个',
          },
          {
            key: 'generationRate',
            label: '终态成功率',
            value: 94.1,
            unit: '%',
          },
          {
            key: 'generationDuration',
            label: '平均任务耗时',
            value: 38.5,
            unit: '秒',
          },
        ],
        series: [
          {
            key: 'content',
            media: 'article',
            name: '文章创作',
            values: [1, 1, 0, 1, 23, 1, 0],
          },
          {
            key: 'aiMaterial',
            media: 'image',
            name: '云端 AI 素材',
            values: [1, 1, 1, 0, 18, 1, 0],
          },
          {
            key: 'comfyui',
            media: 'video',
            name: 'ComfyUI',
            values: [1, 1, 0, 0, 9, 0, 0],
          },
        ]
          .filter(
            (item) =>
              (source === 'all' || source === item.key) &&
              (mediaType === 'all' || mediaType === item.media),
          )
          .map((item) => ({ name: item.name, values: item.values })),
      };
      break;
    }
    case 'creation.recent': {
      const source = String(widget.params.source ?? 'all');
      const mediaType = String(widget.params.mediaType ?? 'all');
      data = {
        items: [
          {
            id: 'article-1',
            title: '品牌内容运营的新思路',
            detail: '文章创作 · 已保存正文',
            source: 'content',
            mediaType: 'article' as const,
          },
          {
            id: 'ai-material-1',
            title: '城市夜景中的科技感主视觉',
            detail: '云端 AI · 图片',
            source: 'aiMaterial',
            mediaType: 'image' as const,
          },
          {
            id: 'comfy-material-1',
            title: '产品展示短视频',
            detail: 'ComfyUI · 视频',
            source: 'comfyui',
            mediaType: 'video' as const,
          },
        ]
          .filter(
            (item) =>
              (source === 'all' || source === item.source) &&
              (mediaType === 'all' || mediaType === item.mediaType),
          )
          .map((item) => ({
            id: item.id,
            title: item.title,
            detail: item.detail,
            mediaType: item.mediaType,
          }))
          .slice(0, Number(widget.params.limit ?? 8)),
      };
      break;
    }
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
          { id: 'articles', title: '文章创作', detail: '进入模块' },
          {
            id: 'contentGeneration',
            title: '生成记录',
            detail: '进入模块',
          },
          { id: 'materials', title: '素材管理', detail: '进入模块' },
          { id: 'comfyCreate', title: 'ComfyUI 创作', detail: '进入模块' },
          {
            id: 'comfyMaterials',
            title: 'ComfyUI 素材',
            detail: '进入模块',
          },
          {
            id: 'comfyTasks',
            title: 'ComfyUI 生成记录',
            detail: '进入模块',
          },
        ].filter((x) => (widget.params.links as string[]).includes(x.id)),
      };
  }
  return { ...widget, status: 'ready', data };
}
