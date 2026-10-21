import { Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityTarget, type ObjectLiteral } from 'typeorm';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { AgentExecution } from '../agent-apps/entities/agent-execution.entity';
import { AgentApp } from '../agent-apps/entities/agent-app.entity';
import { Product } from '../product-catalog/entities/product.entity';
import { ProductSku } from '../product-catalog/entities/product-sku.entity';
import { KnowledgeBase } from '../knowledge-bases/entities/knowledge-base.entity';
import { KnowledgeAiChatSession } from '../knowledge-ai-chat/entities/knowledge-ai-chat-session.entity';
import { CustomerChatTask } from '../customer-service/entities/customer-chat-task.entity';
import { LogRecord } from '../log-records/entities/log-record.entity';
import { ContentArticle } from '../content-articles/entities/content-article.entity';
import { ContentGenerationTask } from '../content-articles/entities/content-generation-task.entity';
import { AiMaterial } from '../ai-materials/entities/ai-material.entity';
import { MaterialGenerationTask } from '../ai-materials/entities/material-generation-task.entity';
import { ComfyTask } from '../comfyui/entities/comfy-task.entity';
import { ComfyMaterial } from '../comfyui/entities/comfy-material.entity';
import { DashboardConfigService } from './dashboard-config.service';
import {
  DASHBOARD_LINKS,
  DASHBOARD_WIDGETS,
  allowed,
  canViewWidget,
  resolveWidgets,
} from './dashboard.registry';
import type {
  DashboardHome,
  DashboardItem,
  DashboardMetric,
  WidgetConfig,
  WidgetData,
} from './dashboard.types';
import type { QueryDashboardDto } from './dto/dashboard.dto';

const n = (value: unknown) => Number(value ?? 0);
const EXEC_PATH = '/agent-management/executions';
type GenerationSource = 'content' | 'aiMaterial' | 'comfyui';
type GenerationMediaType = 'article' | 'image' | 'video';
interface GenerationAggregateRow {
  source: GenerationSource;
  mediaType: GenerationMediaType;
  date: string;
  status: string;
  count: number;
  durationSeconds: number;
  durationCoverage: number;
}
export function shanghaiRange(days: number, now = new Date()) {
  const endDay = new Date(now.getTime() + 480 * 60000)
    .toISOString()
    .slice(0, 10);
  const start = new Date(endDay + 'T00:00:00+08:00');
  start.setTime(start.getTime() - (days - 1) * 86400000);
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(start.getTime() + i * 86400000 + 480 * 60000)
      .toISOString()
      .slice(0, 10),
  );
  return { start, end: now, dates };
}
export function successRate(success: number, failed: number) {
  return success + failed
    ? Math.round((success / (success + failed)) * 1000) / 10
    : null;
}
export function knowledgeHealth(
  row: Pick<
    KnowledgeBase,
    'parseStatus' | 'chunkStatus' | 'indexStatus' | 'processStage' | 'isEnabled'
  >,
) {
  const statuses = [row.parseStatus, row.chunkStatus, row.indexStatus];
  if (row.processStage === 'failed' || statuses.includes('failed'))
    return '异常';
  if (
    statuses.some((s) => !['pending', 'processing', 'success'].includes(s)) ||
    ![
      'uploaded',
      'parsing',
      'parsed',
      'chunking',
      'chunked',
      'indexing',
      'indexed',
      'failed',
    ].includes(row.processStage)
  )
    return '未识别';
  if (statuses.includes('processing')) return '处理中';
  if (
    row.isEnabled &&
    statuses.every((s) => s === 'success') &&
    row.processStage === 'indexed'
  )
    return '可用';
  return '待处理 / 停用';
}
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  constructor(
    private readonly db: DataSource,
    private readonly configs: DashboardConfigService,
  ) {}
  private query<T extends ObjectLiteral>(entity: EntityTarget<T>) {
    return this.db.getRepository(entity).createQueryBuilder('r');
  }
  async home(
    user: AuthUser,
    query: QueryDashboardDto = {},
  ): Promise<DashboardHome> {
    const config = await this.configs.read();
    const now = new Date();
    const cache = new Map<string, Promise<WidgetData>>();
    const load = (key: string, fn: () => Promise<WidgetData>) => {
      if (!cache.has(key)) cache.set(key, fn());
      return cache.get(key)!;
    };
    const widgets = resolveWidgets(config.widgets).filter(
      (w) =>
        w.enabled &&
        (!query.instanceId || w.instanceId === query.instanceId) &&
        canViewWidget(
          user,
          DASHBOARD_WIDGETS.find((d) => d.key === w.widgetKey)!,
        ),
    );
    const result: DashboardHome['widgets'] = [];
    // 有限板块顺序装配；共享查询缓存避免核心卡片和健康卡重复查询。
    for (const original of widgets) {
      const w = { ...original, params: { ...original.params } };
      if (query.days && 'days' in w.params) w.params.days = query.days;
      try {
        let data: WidgetData;
        switch (w.widgetKey) {
          case 'core.metrics':
          case 'business.health':
            data = await load(w.widgetKey + JSON.stringify(w.params), () =>
              this.metrics(user, w, now, load),
            );
            break;
          case 'agent.executionTrend':
            data = await load('agent:' + Number(w.params.days), () =>
              this.agent(Number(w.params.days), now),
            );
            if (!w.params.showToken)
              data = {
                ...data,
                metrics: data.metrics?.filter((m) => m.key !== 'tokens'),
              };
            if (!w.params.showAverageDuration)
              data = {
                ...data,
                metrics: data.metrics?.filter((m) => m.key !== 'duration'),
              };
            break;
          case 'catalog.distribution':
            data = await this.catalog(w);
            break;
          case 'customer.taskTrend':
            data = await this.customer(Number(w.params.days), now);
            break;
          case 'content.generationTrend':
            data = await this.contentGeneration(
              user,
              Number(w.params.days),
              now,
              {
                viewMode: String(w.params.viewMode),
                source: String(w.params.source),
                mediaType: String(w.params.mediaType),
              },
            );
            break;
          case 'generation.health':
            data = await this.generationHealth(
              user,
              Number(w.params.days),
              now,
              {
                source: String(w.params.source),
                mediaType: String(w.params.mediaType),
              },
            );
            break;
          case 'creation.recent':
            data = await this.recentCreations(
              user,
              String(w.params.source),
              String(w.params.mediaType),
              Number(w.params.limit),
            );
            break;
          case 'knowledge.health':
            data = await load('knowledge', () => this.knowledge());
            break;
          case 'operations.todo':
            data = await this.todos(user, Number(w.params.limit), now);
            break;
          case 'activity.recent':
            data = await this.activities(user, Number(w.params.limit));
            break;
          default:
            data = {
              items: DASHBOARD_LINKS.filter(
                (x) =>
                  allowed(user, x.permission) &&
                  (w.params.links as string[]).includes(x.key),
              ).map((x) => ({
                id: x.key,
                title: x.label,
                detail: '进入模块',
                path: x.path,
              })),
            };
        }
        // 混合卡片全部被权限裁剪时不占空槽。
        if (
          (w.widgetKey === 'core.metrics' ||
            w.widgetKey === 'business.health') &&
          !data.metrics?.length
        )
          continue;
        result.push({ ...w, status: 'ready', data });
      } catch (error) {
        this.logger.error(
          '首页板块查询失败: ' + w.widgetKey,
          error instanceof Error ? error.stack : undefined,
        );
        result.push({ ...w, status: 'unavailable', data: null });
      }
    }
    return {
      layoutVersion: config.revision,
      generatedAt: now.toISOString(),
      widgets: result,
    };
  }
  private async metrics(
    user: AuthUser,
    w: WidgetConfig,
    now: Date,
    load: (key: string, fn: () => Promise<WidgetData>) => Promise<WidgetData>,
  ): Promise<WidgetData> {
    const all = w.widgetKey === 'business.health';
    const requested = w.params.metrics as string[] | undefined;
    const metrics: DashboardMetric[] = [];
    const need = (key: string) => all || requested?.includes(key);
    if (
      allowed(user, 'AgentApp.read') &&
      (all || need('agentTotal') || need('agentRate'))
    ) {
      const data = await load('agent:1', () => this.agent(1, now));
      for (const m of data.metrics ?? [])
        if (['agentTotal', 'agentRate'].includes(m.key) && need(m.key))
          metrics.push(m);
      if (all) {
        const apps = await this.query(AgentApp)
          .select('COUNT(*)', 'total')
          .addSelect('SUM(r.isEnabled = 1)', 'enabled')
          .getRawOne<{ total: string; enabled: string }>();
        metrics.push({
          key: 'apps',
          label: '启用 Agent',
          value: n(apps?.enabled),
          hint: '共 ' + n(apps?.total) + ' 个应用',
          path: '/agent-management/apps',
        });
      }
    }
    if (allowed(user, 'CustomerService.read') && need('waitingHuman')) {
      const count = await this.query(KnowledgeAiChatSession)
        .where('r.externalAppId IS NOT NULL')
        .andWhere('r.serviceStatus = :status', { status: 'waiting_human' })
        .getCount();
      metrics.push({
        key: 'waitingHuman',
        label: '等待人工',
        value: count,
        unit: '个会话',
        path: '/customer-service',
      });
    }
    for (const [key, label, entity, permission, path] of [
      [
        'productTotal',
        '产品总数',
        Product,
        'Product.read',
        '/business-data/products',
      ],
      [
        'skuTotal',
        'SKU 总数',
        ProductSku,
        'ProductSku.read',
        '/business-data/product-skus',
      ],
    ] as const) {
      if (allowed(user, permission) && need(key)) {
        const row = await this.db
          .getRepository(entity)
          .createQueryBuilder('r')
          .select('COUNT(*)', 'total')
          .addSelect('SUM(r.isEnabled = 1)', 'enabled')
          .getRawOne<{ total: string; enabled: string }>();
        metrics.push({
          key,
          label,
          value: n(row?.total),
          unit: '条记录',
          hint: '启用 ' + n(row?.enabled),
          path,
        });
      }
    }
    const contentAccess = allowed(user, 'ContentArticle.read');
    const materialAccess = allowed(user, 'AiMaterial.read');
    const comfyTaskAccess = allowed(user, 'ComfyTask.read');
    if (!all && contentAccess && need('contentTotal')) {
      metrics.push({
        key: 'contentTotal',
        label: '内容创作数',
        value: await this.query(ContentArticle)
          .where('r.userId = :userId', { userId: user.userId })
          .getCount(),
        unit: '篇',
        hint: '仅当前用户',
        path: '/content-articles',
      });
    }
    if (!all && materialAccess && need('materialTotal')) {
      const materials = await this.query(AiMaterial)
        .select('COUNT(*)', 'total')
        .addSelect(
          "SUM(COALESCE(r.currentMediaType, r.mediaType) = 'image')",
          'images',
        )
        .addSelect(
          "SUM(COALESCE(r.currentMediaType, r.mediaType) = 'video')",
          'videos',
        )
        .where('r.userId = :userId', { userId: user.userId })
        .getRawOne<{ total: string; images: string; videos: string }>();
      metrics.push({
        key: 'materialTotal',
        label: 'AI 素材数',
        value: n(materials?.total),
        unit: '份',
        hint: `图片 ${n(materials?.images)} · 视频 ${n(materials?.videos)}`,
        path: '/ai-materials',
      });
    }
    if (
      !all &&
      (contentAccess || materialAccess || comfyTaskAccess) &&
      need('generationTotal')
    ) {
      const articleTasks = contentAccess
        ? await this.query(ContentGenerationTask)
            .where('r.userId = :userId', { userId: user.userId })
            .getCount()
        : 0;
      const materialTasks = materialAccess
        ? await this.query(MaterialGenerationTask)
            .where('r.userId = :userId', { userId: user.userId })
            .getCount()
        : 0;
      const comfyTasks = comfyTaskAccess
        ? await this.query(ComfyTask)
            .where('r.userId = :userId', { userId: user.userId })
            .getCount()
        : 0;
      const hints = [
        contentAccess ? '文章 ' + articleTasks : '',
        materialAccess ? '云端素材 ' + materialTasks : '',
        comfyTaskAccess ? 'ComfyUI ' + comfyTasks : '',
      ].filter(Boolean);
      metrics.push({
        key: 'generationTotal',
        label: '生成记录数',
        value: articleTasks + materialTasks + comfyTasks,
        unit: '次',
        hint: hints.join(' · '),
        path: contentAccess
          ? '/content-generation'
          : materialAccess
            ? '/ai-materials'
            : '/comfyui/create',
      });
    }
    if (all && allowed(user, 'KnowledgeBase.read')) {
      const data = await load('knowledge', () => this.knowledge());
      metrics.push(...(data.metrics ?? []));
    }
    return { metrics };
  }
  private dayExpression(alias: string) {
    // createdAt 是 TIMESTAMP；先取 epoch 再加上海偏移，不依赖 Node/DB 时区或 MySQL 时区表。
    return (
      'DATE_FORMAT(TIMESTAMPADD(SECOND, UNIX_TIMESTAMP(' +
      alias +
      ".createdAt) + 28800, '1970-01-01'), '%Y-%m-%d')"
    );
  }
  async agent(days: number, now: Date): Promise<WidgetData> {
    const range = shanghaiRange(days, now);
    const day = this.dayExpression('r');
    const rows = await this.query(AgentExecution)
      .select(day, 'date')
      .addSelect('COUNT(*)', 'total')
      .addSelect("SUM(r.status = 'succeeded')", 'succeeded')
      .addSelect("SUM(r.status = 'failed')", 'failed')
      .addSelect("SUM(r.status = 'cancelled')", 'cancelled')
      .addSelect('SUM(r.totalTokens)', 'tokens')
      .addSelect('COUNT(r.totalTokens)', 'coverage')
      .addSelect('SUM(r.modelCallDurationMs)', 'duration')
      .addSelect('COUNT(r.modelCallDurationMs)', 'durationCoverage')
      .where(
        'r.createdAt >= FROM_UNIXTIME(:startEpoch) AND r.createdAt <= FROM_UNIXTIME(:endEpoch)',
        {
          startEpoch: range.start.getTime() / 1000,
          endEpoch: range.end.getTime() / 1000,
        },
      )
      .groupBy(day)
      .orderBy('date', 'ASC')
      .getRawMany<Record<string, string>>();
    const values = range.dates.map(
      (date) => rows.find((row) => row.date === date) ?? {},
    );
    const sum = (key: string) =>
      values.reduce((total, row) => total + n(row[key]), 0);
    return {
      labels: range.dates,
      series: [
        { name: '执行量', values: values.map((r) => n(r.total)), kind: 'bar' },
        {
          name: '成功率',
          values: values.map((r) => successRate(n(r.succeeded), n(r.failed))),
          kind: 'line',
          percent: true,
        },
      ],
      metrics: [
        {
          key: 'agentTotal',
          label: days === 1 ? '今日执行' : '执行总数',
          value: sum('total'),
          unit: '次',
          path: EXEC_PATH,
        },
        {
          key: 'agentRate',
          label: days === 1 ? '今日成功率' : '成功率',
          value: successRate(sum('succeeded'), sum('failed')),
          unit: '%',
          hint: '失败 ' + sum('failed') + ' · 取消 ' + sum('cancelled'),
          path: EXEC_PATH,
        },
        {
          key: 'tokens',
          label: '已记录 Token',
          value: sum('coverage') ? sum('tokens') : null,
          hint: '有回执 ' + sum('coverage') + ' / ' + sum('total') + ' 次',
        },
        {
          key: 'duration',
          label: '平均模型耗时',
          value: sum('durationCoverage')
            ? Math.round(sum('duration') / sum('durationCoverage'))
            : null,
          unit: 'ms',
        },
      ],
      note: '按执行创建日统计当前状态；成功率不包含取消和未完成任务。Token 仅统计供应商已返回的用量。',
    };
  }
  private async catalog(w: WidgetConfig): Promise<WidgetData> {
    const includeDisabled = w.params.includeDisabled === true;
    const productQ = this.query(Product);
    if (!includeDisabled) productQ.andWhere('r.isEnabled = 1');
    const productTotal = await productQ.getCount();
    const skuQ = this.query(ProductSku).innerJoin(
      Product,
      'p',
      'p.id = r.productId AND p.deletedAt IS NULL',
    );
    if (!includeDisabled) skuQ.andWhere('r.isEnabled = 1 AND p.isEnabled = 1');
    const skuTotal = await skuQ.getCount();
    const groupByProduct = w.params.groupBy === 'product';
    const dimension = groupByProduct
      ? 'r.name'
      : "COALESCE(NULLIF(TRIM(r.category), ''), '未分类')";
    const rows = await productQ
      .clone()
      .leftJoin(
        ProductSku,
        'sku',
        'sku.productId = r.id AND sku.deletedAt IS NULL' +
          (includeDisabled ? '' : ' AND sku.isEnabled = 1'),
      )
      .select(dimension, 'label')
      .addSelect('COUNT(DISTINCT r.id)', 'products')
      .addSelect('COUNT(sku.id)', 'skus')
      .groupBy(groupByProduct ? 'r.id' : dimension)
      .addGroupBy(dimension)
      .orderBy('skus', 'DESC')
      .addOrderBy(groupByProduct ? 'r.id' : 'label', 'ASC')
      .limit(Number(w.params.limit))
      .getRawMany<{ label: string; products: string; skus: string }>();
    const noSku = await productQ
      .clone()
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM product_skus s WHERE s.productId = r.id AND s.deletedAt IS NULL' +
          (includeDisabled ? '' : ' AND s.isEnabled = 1') +
          ')',
      )
      .getCount();
    const labels = rows.map((r) => r.label);
    const products = rows.map((r) => n(r.products)),
      skus = rows.map((r) => n(r.skus));
    if (!groupByProduct && products.reduce((a, b) => a + b, 0) < productTotal) {
      labels.push('其他');
      products.push(productTotal - products.reduce((a, b) => a + b, 0));
      skus.push(skuTotal - skus.reduce((a, b) => a + b, 0));
    }
    return {
      labels,
      series: groupByProduct
        ? [{ name: 'SKU 数', values: skus }]
        : [
            { name: '产品数', values: products },
            { name: 'SKU 数', values: skus },
          ],
      metrics: [
        {
          key: 'products',
          label: '产品',
          value: productTotal,
          path: '/business-data/products',
        },
        {
          key: 'skus',
          label: 'SKU',
          value: skuTotal,
          path: '/business-data/product-skus',
        },
        {
          key: 'average',
          label: '平均 SKU / 产品',
          value: productTotal
            ? Math.round((skuTotal / productTotal) * 10) / 10
            : 0,
        },
        { key: 'empty', label: '无 SKU 产品', value: noSku },
      ],
      note:
        (includeDisabled ? '包含停用记录' : '仅启用产品及其启用 SKU') +
        '；不含已删除产品的 SKU，数量表示记录数。',
    };
  }
  private async customer(days: number, now: Date): Promise<WidgetData> {
    const range = shanghaiRange(days, now),
      day = this.dayExpression('r');
    const rows = await this.query(CustomerChatTask)
      .select(day, 'date')
      .addSelect('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where(
        'r.createdAt >= FROM_UNIXTIME(:startEpoch) AND r.createdAt <= FROM_UNIXTIME(:endEpoch)',
        {
          startEpoch: range.start.getTime() / 1000,
          endEpoch: range.end.getTime() / 1000,
        },
      )
      .groupBy(day)
      .addGroupBy('r.status')
      .getRawMany<{ date: string; status: string; count: string }>();
    const groups: Array<[string, string[]]> = [
      ['完成', ['completed']],
      ['失败', ['failed']],
      ['取消 / 过期', ['cancelled', 'expired']],
      ['进行中', ['queued', 'running', 'cancelling']],
    ];
    const known = new Set(groups.flatMap(([, statuses]) => statuses));
    const unknown = [
      ...new Set(
        rows.map((row) => row.status).filter((status) => !known.has(status)),
      ),
    ];
    if (unknown.length) groups.push(['未识别', unknown]);
    return {
      labels: range.dates,
      series: groups.map(([name, statuses]) => ({
        name,
        values: range.dates.map((date) =>
          rows
            .filter((r) => r.date === date && statuses.includes(r.status))
            .reduce((sum, r) => sum + n(r.count), 0),
        ),
      })),
      note: '按任务创建日统计当前状态，不代表历史转人工率。',
    };
  }
  async contentGeneration(
    user: AuthUser,
    days: number,
    now: Date,
    options: {
      viewMode?: string;
      source?: string;
      mediaType?: string;
    } = {},
  ): Promise<WidgetData> {
    const range = shanghaiRange(days, now);
    const rows = this.filterGenerationRows(
      await this.generationRows(user, range),
      options.source,
      options.mediaType,
    );
    const count = (
      predicate: (row: GenerationAggregateRow) => boolean,
      date?: string,
    ) =>
      rows
        .filter((row) => predicate(row) && (!date || row.date === date))
        .reduce((total, row) => total + row.count, 0);
    const successStatuses = new Set(['succeeded', 'adopted']);
    const terminalStatuses = new Set([
      'succeeded',
      'adopted',
      'failed',
      'interrupted',
      'cancelled',
      'unknown',
    ]);
    const waitingStatuses = new Set([
      'pending',
      'submitting',
      'queued',
      'running',
      'storing',
      'archiving',
      'needs_input',
    ]);
    const succeeded = rows
      .filter((row) => successStatuses.has(row.status))
      .reduce((total, row) => total + row.count, 0);
    const terminal = rows
      .filter((row) => terminalStatuses.has(row.status))
      .reduce((total, row) => total + row.count, 0);
    const waiting = rows
      .filter((row) => waitingStatuses.has(row.status))
      .reduce((total, row) => total + row.count, 0);
    const sourceSeries: Array<{
      key: GenerationSource;
      name: string;
    }> = [
      { key: 'content', name: '文章创作' },
      { key: 'aiMaterial', name: '云端 AI 素材' },
      { key: 'comfyui', name: 'ComfyUI' },
    ];
    const mediaSeries: Array<{
      key: GenerationMediaType;
      name: string;
    }> = [
      { key: 'article', name: '文章' },
      { key: 'image', name: '图片' },
      { key: 'video', name: '视频' },
    ];
    const dimensions =
      options.viewMode === 'mediaType' ? mediaSeries : sourceSeries;
    const series = dimensions
      .filter(({ key }) =>
        rows.some((row) =>
          options.viewMode === 'mediaType'
            ? row.mediaType === key
            : row.source === key,
        ),
      )
      .map(({ key, name }) => ({
        name,
        values: range.dates.map((date) =>
          count(
            (row) =>
              (options.viewMode === 'mediaType'
                ? row.mediaType
                : row.source) === key,
            date,
          ),
        ),
        kind: 'bar' as const,
      }));
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const path = this.generationPath(options.source, user);
    return {
      labels: range.dates,
      series,
      metrics: [
        {
          key: 'generationTotal',
          label: '生成记录',
          value: total,
          unit: '次',
          hint: `${days} 天内`,
          path,
        },
        {
          key: 'generationRate',
          label: '生成成功率',
          value: terminal ? successRate(succeeded, terminal - succeeded) : null,
          unit: '%',
          hint: '成功 ' + succeeded + ' · 已终止 ' + (terminal - succeeded),
        },
        {
          key: 'generationWaiting',
          label: '待处理任务',
          value: waiting,
          unit: '个',
          hint: '含排队、存储与待补充任务',
        },
      ],
      note: '仅统计当前用户按任务创建日产生的记录；成功率不包含运行中、排队中、存储中和待补充任务。筛选只影响本板块。',
    };
  }
  async generationHealth(
    user: AuthUser,
    days: number,
    now: Date,
    options: { source?: string; mediaType?: string } = {},
  ): Promise<WidgetData> {
    const range = shanghaiRange(days, now);
    const rows = this.filterGenerationRows(
      await this.generationRows(user, range),
      options.source,
      options.mediaType,
    );
    const buckets = [
      {
        label: '等待',
        statuses: new Set(['pending', 'submitting', 'queued']),
      },
      { label: '运行', statuses: new Set(['running']) },
      { label: '存储 / 归档', statuses: new Set(['storing', 'archiving']) },
      { label: '待补充', statuses: new Set(['needs_input']) },
      { label: '成功', statuses: new Set(['succeeded', 'adopted']) },
      {
        label: '失败 / 中断',
        statuses: new Set(['failed', 'interrupted', 'cancelled']),
      },
      { label: '未识别', statuses: new Set(['unknown']) },
    ];
    const known = new Set(buckets.flatMap((bucket) => [...bucket.statuses]));
    const sources: Array<{ key: GenerationSource; name: string }> = [
      { key: 'content', name: '文章创作' },
      { key: 'aiMaterial', name: '云端 AI 素材' },
      { key: 'comfyui', name: 'ComfyUI' },
    ];
    const bucketCount = (source: GenerationSource, index: number) =>
      rows
        .filter(
          (row) =>
            row.source === source &&
            (index === buckets.length - 1
              ? buckets[index].statuses.has(row.status) ||
                !known.has(row.status)
              : buckets[index].statuses.has(row.status)),
        )
        .reduce((sum, row) => sum + row.count, 0);
    const series = sources
      .filter(({ key }) => rows.some((row) => row.source === key))
      .map(({ key, name }) => ({
        name,
        values: buckets.map((_, index) => bucketCount(key, index)),
        kind: 'bar' as const,
      }));
    const activeStatuses = new Set([
      'pending',
      'submitting',
      'queued',
      'running',
      'storing',
      'archiving',
    ]);
    const successStatuses = new Set(['succeeded', 'adopted']);
    const failedStatuses = new Set([
      'failed',
      'interrupted',
      'cancelled',
      'unknown',
    ]);
    const sumStatuses = (statuses: Set<string>) =>
      rows
        .filter((row) => statuses.has(row.status))
        .reduce((sum, row) => sum + row.count, 0);
    const active = sumStatuses(activeStatuses);
    const succeeded = sumStatuses(successStatuses);
    const failed =
      sumStatuses(failedStatuses) +
      rows
        .filter((row) => !known.has(row.status))
        .reduce((sum, row) => sum + row.count, 0);
    const durationSeconds = rows.reduce(
      (sum, row) => sum + row.durationSeconds,
      0,
    );
    const durationCoverage = rows.reduce(
      (sum, row) => sum + row.durationCoverage,
      0,
    );
    return {
      labels: buckets.map((bucket) => bucket.label),
      series,
      metrics: [
        {
          key: 'activeGeneration',
          label: '处理中',
          value: active,
          unit: '个',
          hint: '等待、运行、存储或归档',
          path: this.generationPath(options.source, user),
        },
        {
          key: 'failedGeneration',
          label: '失败与异常',
          value: failed,
          unit: '个',
          hint: `${days} 天内`,
        },
        {
          key: 'generationRate',
          label: '终态成功率',
          value: successRate(succeeded, failed),
          unit: '%',
          hint: `成功 ${succeeded} · 失败 ${failed}`,
        },
        {
          key: 'generationDuration',
          label: '平均任务耗时',
          value: durationCoverage
            ? Math.round((durationSeconds / durationCoverage) * 10) / 10
            : null,
          unit: '秒',
          hint: `已记录 ${durationCoverage} 个终态任务`,
        },
      ],
      note: `按近 ${days} 天创建的任务统计当前状态；耗时仅计算同时记录开始与完成时间的任务。`,
    };
  }
  async recentCreations(
    user: AuthUser,
    source = 'all',
    mediaType = 'all',
    limit = 8,
  ): Promise<WidgetData> {
    const items: NonNullable<WidgetData['items']> = [];
    const accepts = (expectedSource: string, expectedMedia: string) =>
      (source === 'all' || source === expectedSource) &&
      (mediaType === 'all' || mediaType === expectedMedia);
    if (allowed(user, 'ContentArticle.read') && accepts('content', 'article')) {
      const articles = await this.query(ContentArticle)
        .select('r.id', 'id')
        .addSelect('r.title', 'title')
        .addSelect('r.coverUrl', 'thumbnailUrl')
        .addSelect('r.updatedAt', 'updatedAt')
        .where('r.userId = :userId', { userId: user.userId })
        .andWhere("r.content <> ''")
        .orderBy('r.updatedAt', 'DESC')
        .take(limit)
        .getRawMany<{
          id: number;
          title: string;
          thumbnailUrl: string;
          updatedAt: Date | string;
        }>();
      items.push(
        ...articles.map((row) => ({
          id: `article-${row.id}`,
          title: row.title,
          detail: '文章创作 · 已保存正文',
          time: this.isoTime(row.updatedAt),
          path: '/content-articles',
          thumbnailUrl: row.thumbnailUrl || undefined,
          mediaType: 'article' as const,
        })),
      );
    }
    if (
      allowed(user, 'AiMaterial.read') &&
      (source === 'all' || source === 'aiMaterial') &&
      mediaType !== 'article'
    ) {
      const materials = await this.query(AiMaterial)
        .select('r.id', 'id')
        .addSelect('LEFT(r.prompt, 80)', 'title')
        .addSelect('r.currentImageUrl', 'fileUrl')
        .addSelect('COALESCE(r.currentMediaType, r.mediaType)', 'mediaType')
        .addSelect('r.updatedAt', 'updatedAt')
        .where('r.userId = :userId', { userId: user.userId })
        .andWhere('r.generationStatus = :status', { status: 'succeeded' })
        .andWhere('r.currentFileId IS NOT NULL')
        .andWhere('r.currentImageUrl IS NOT NULL')
        .orderBy('r.updatedAt', 'DESC')
        .take(limit)
        .getRawMany<{
          id: number;
          title: string;
          fileUrl: string;
          mediaType: GenerationMediaType;
          updatedAt: Date | string;
        }>();
      items.push(
        ...materials
          .filter((row) => mediaType === 'all' || row.mediaType === mediaType)
          .map((row) => ({
            id: `ai-material-${row.id}`,
            title: row.title || `AI 素材 #${row.id}`,
            detail: `云端 AI · ${row.mediaType === 'video' ? '视频' : '图片'}`,
            time: this.isoTime(row.updatedAt),
            path: '/ai-materials',
            thumbnailUrl: row.mediaType === 'image' ? row.fileUrl : undefined,
            mediaType: this.generationMediaType('aiMaterial', row.mediaType),
          })),
      );
    }
    if (
      allowed(user, 'ComfyMaterial.read') &&
      (source === 'all' || source === 'comfyui') &&
      mediaType !== 'article'
    ) {
      const materials = await this.query(ComfyMaterial)
        .select('r.id', 'id')
        .addSelect('r.name', 'title')
        .addSelect('r.fileUrl', 'fileUrl')
        .addSelect('r.mediaType', 'mediaType')
        .addSelect('r.updatedAt', 'updatedAt')
        .where('r.userId = :userId', { userId: user.userId })
        .andWhere("r.sourceType = 'output'")
        .andWhere('r.fileUrl IS NOT NULL')
        .andWhere("r.mediaType IN ('image', 'video')")
        .orderBy('r.updatedAt', 'DESC')
        .take(limit)
        .getRawMany<{
          id: number;
          title: string;
          fileUrl: string;
          mediaType: GenerationMediaType;
          updatedAt: Date | string;
        }>();
      items.push(
        ...materials
          .filter((row) => mediaType === 'all' || row.mediaType === mediaType)
          .map((row) => ({
            id: `comfy-material-${row.id}`,
            title: row.title,
            detail: `ComfyUI · ${row.mediaType === 'video' ? '视频' : '图片'}`,
            time: this.isoTime(row.updatedAt),
            path: '/comfyui/materials',
            thumbnailUrl: row.mediaType === 'image' ? row.fileUrl : undefined,
            mediaType: this.generationMediaType('comfyui', row.mediaType),
          })),
      );
    }
    return {
      items: items
        .sort(
          (a, b) =>
            new Date(b.time ?? 0).getTime() - new Date(a.time ?? 0).getTime(),
        )
        .slice(0, limit),
      note: '文章只展示已保存正文；素材只展示当前成功成果，不返回正文、完整提示词或工作流参数。',
    };
  }
  private async generationRows(
    user: AuthUser,
    range: ReturnType<typeof shanghaiRange>,
  ): Promise<GenerationAggregateRow[]> {
    const rows: GenerationAggregateRow[] = [];
    const load = async (
      entity: EntityTarget<ObjectLiteral>,
      source: GenerationSource,
      mediaExpression: string,
    ) => {
      const day = this.dayExpression('r');
      const result = await this.query(entity)
        .select(day, 'date')
        .addSelect('r.status', 'status')
        .addSelect(mediaExpression, 'mediaType')
        .addSelect('COUNT(*)', 'count')
        .addSelect(
          'COALESCE(SUM(CASE WHEN r.startedAt IS NOT NULL AND r.finishedAt IS NOT NULL THEN TIMESTAMPDIFF(SECOND, r.startedAt, r.finishedAt) ELSE 0 END), 0)',
          'durationSeconds',
        )
        .addSelect(
          'SUM(r.startedAt IS NOT NULL AND r.finishedAt IS NOT NULL)',
          'durationCoverage',
        )
        .where('r.userId = :userId', { userId: user.userId })
        .andWhere(
          'r.createdAt >= FROM_UNIXTIME(:startEpoch) AND r.createdAt <= FROM_UNIXTIME(:endEpoch)',
          {
            startEpoch: range.start.getTime() / 1000,
            endEpoch: range.end.getTime() / 1000,
          },
        )
        .groupBy(day)
        .addGroupBy('r.status')
        .addGroupBy(mediaExpression)
        .getRawMany<{
          date: string;
          status: string;
          mediaType: string;
          count: string;
          durationSeconds: string;
          durationCoverage: string;
        }>();
      rows.push(
        ...result.map((row) => ({
          source,
          mediaType: this.generationMediaType(source, row.mediaType),
          date: row.date,
          status: row.status,
          count: n(row.count),
          durationSeconds: n(row.durationSeconds),
          durationCoverage: n(row.durationCoverage),
        })),
      );
    };
    if (allowed(user, 'ContentArticle.read'))
      await load(ContentGenerationTask, 'content', "'article'");
    if (allowed(user, 'AiMaterial.read'))
      await load(
        MaterialGenerationTask,
        'aiMaterial',
        "COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.snapshot, '$.mediaType')), 'image')",
      );
    if (allowed(user, 'ComfyTask.read'))
      await load(ComfyTask, 'comfyui', "COALESCE(r.outputType, 'image')");
    return rows;
  }
  private filterGenerationRows(
    rows: GenerationAggregateRow[],
    source?: string,
    mediaType?: string,
  ) {
    return rows.filter(
      (row) =>
        (!source || source === 'all' || row.source === source) &&
        (!mediaType || mediaType === 'all' || row.mediaType === mediaType),
    );
  }
  private generationMediaType(
    source: GenerationSource,
    value: string,
  ): GenerationMediaType {
    if (source === 'content') return 'article';
    return value === 'video' ? 'video' : 'image';
  }
  private generationPath(source: string | undefined, user: AuthUser) {
    if (source === 'comfyui') return '/comfyui/create';
    if (source === 'aiMaterial') return '/ai-materials';
    if (source === 'content') return '/content-generation';
    if (allowed(user, 'ContentArticle.read')) return '/content-generation';
    if (allowed(user, 'AiMaterial.read')) return '/ai-materials';
    return '/comfyui/create';
  }
  private isoTime(value: Date | string) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  private async knowledge(): Promise<WidgetData> {
    const rows = await this.query(KnowledgeBase)
      .select('r.processStage', 'processStage')
      .addSelect('r.parseStatus', 'parseStatus')
      .addSelect('r.chunkStatus', 'chunkStatus')
      .addSelect('r.indexStatus', 'indexStatus')
      .addSelect('r.isEnabled', 'isEnabled')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.processStage')
      .addGroupBy('r.parseStatus')
      .addGroupBy('r.chunkStatus')
      .addGroupBy('r.indexStatus')
      .addGroupBy('r.isEnabled')
      .getRawMany<KnowledgeBase & { count: string }>();
    const labels = ['可用', '处理中', '待处理 / 停用', '异常', '未识别'];
    const values = labels.map((label) =>
      rows
        .filter(
          (r) =>
            knowledgeHealth({ ...r, isEnabled: Number(r.isEnabled) === 1 }) ===
            label,
        )
        .reduce((s, r) => s + n(r.count), 0),
    );
    return {
      labels,
      series: [{ name: '知识库记录', values }],
      metrics: [
        {
          key: 'knowledge',
          label: '可用知识库',
          value: values[0],
          hint: '共 ' + values.reduce((a, b) => a + b, 0) + ' 条记录',
          path: '/knowledge-bases/list',
        },
      ],
      note: '以知识库记录为统计单位；只有启用且解析、分片、索引均完成才计为可用。',
    };
  }
  private async todos(
    user: AuthUser,
    limit: number,
    now: Date,
  ): Promise<WidgetData> {
    const items: DashboardItem[] = [];
    if (allowed(user, 'CustomerService.read')) {
      const rows = await this.query(KnowledgeAiChatSession)
        .select(['r.id', 'r.title', 'r.updatedAt'])
        .where('r.externalAppId IS NOT NULL')
        .andWhere('r.serviceStatus = :s', { s: 'waiting_human' })
        .orderBy('r.updatedAt', 'ASC')
        .take(limit)
        .getMany();
      items.push(
        ...rows.map((r) => ({
          id: 'customer-' + r.id,
          title: r.title,
          detail: '等待人工接待',
          time: r.updatedAt.toISOString(),
          path: '/customer-service',
        })),
      );
    }
    if (allowed(user, 'AgentApp.read')) {
      const rows = await this.query(AgentExecution)
        .select(['r.id', 'r.agentAppId', 'r.statusReason', 'r.createdAt'])
        .where('r.status = :s', { s: 'failed' })
        .andWhere('r.createdAt >= FROM_UNIXTIME(:startEpoch)', {
          startEpoch: shanghaiRange(7, now).start.getTime() / 1000,
        })
        .orderBy('r.id', 'DESC')
        .take(limit)
        .getMany();
      items.push(
        ...rows.map((r) => ({
          id: 'agent-' + r.id,
          title: 'Agent 执行 #' + r.id,
          detail: '执行失败 · 前往核查',
          time: r.createdAt.toISOString(),
          path: EXEC_PATH,
        })),
      );
    }
    if (allowed(user, 'KnowledgeBase.read')) {
      const rows = await this.query(KnowledgeBase)
        .select(['r.id', 'r.name', 'r.updatedAt'])
        .where(
          "r.processStage = 'failed' OR r.parseStatus = 'failed' OR r.chunkStatus = 'failed' OR r.indexStatus = 'failed'",
        )
        .orderBy('r.updatedAt', 'DESC')
        .take(limit)
        .getMany();
      items.push(
        ...rows.map((r) => ({
          id: 'knowledge-' + r.id,
          title: r.name,
          detail: '知识处理异常',
          time: r.updatedAt.toISOString(),
          path: '/knowledge-bases/list',
        })),
      );
    }
    return {
      items: items.slice(0, limit),
      note: '按接待、执行异常、知识异常顺序展示；执行异常范围为近 7 天。',
    };
  }
  private async activities(user: AuthUser, limit: number): Promise<WidgetData> {
    const modules: Record<string, string> = {
      products: 'Product.read',
      'product-skus': 'ProductSku.read',
      'agent-apps': 'AgentApp.read',
      'agent-workspace': 'AgentWorkspace.read',
      'knowledge-bases': 'KnowledgeBase.read',
      'customer-service': 'CustomerService.read',
    };
    const visible = Object.keys(modules).filter((k) =>
      allowed(user, modules[k]),
    );
    if (!visible.length) return { items: [] };
    const rows = await this.query(LogRecord)
      .select([
        'r.id',
        'r.moduleName',
        'r.action',
        'r.operatorName',
        'r.createdAt',
      ])
      .where('r.moduleId IN (:...modules)', { modules: visible })
      .orderBy('r.id', 'DESC')
      .take(limit)
      .getMany();
    return {
      items: rows.map((r) => ({
        id: String(r.id),
        title: r.moduleName,
        detail: r.operatorName + ' · ' + r.action,
        time: r.createdAt.toISOString(),
        path: '/system-config/log-record',
      })),
      note: '仅显示可访问业务模块的操作元信息。',
    };
  }
}
