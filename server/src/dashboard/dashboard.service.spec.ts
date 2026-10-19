import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import {
  DashboardService,
  knowledgeHealth,
  shanghaiRange,
  successRate,
} from './dashboard.service';
import { DashboardConfigService } from './dashboard-config.service';
import { defaultWidgets } from './dashboard.registry';
import type { AuthUser } from '../common/decorators/current-user.decorator';
const user = (permissions: string[]): AuthUser => ({
  userId: 1,
  username: 'test',
  isAdmin: false,
  roles: [],
  permissions,
});
function fixture() {
  const widgets = defaultWidgets();
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue({ total: '12', enabled: '8' }),
    getCount: jest.fn().mockResolvedValue(0),
  };
  const db = {
    getRepository: jest.fn(() => ({ createQueryBuilder: () => qb })),
  };
  const config = {
    read: jest
      .fn()
      .mockResolvedValue({ published: widgets, publishedVersion: 2 }),
  };
  return {
    widgets,
    qb,
    db,
    service: new DashboardService(
      db as unknown as DataSource,
      config as unknown as DashboardConfigService,
    ),
  };
}
describe('homepage data boundaries', () => {
  it('keeps unknown customer task states visible instead of silently dropping them', async () => {
    const { service, qb, widgets } = fixture();
    widgets.forEach((w) => (w.enabled = w.widgetKey === 'customer.taskTrend'));
    const date = shanghaiRange(7).dates.at(-1);
    qb.getRawMany.mockResolvedValue([
      { date, status: 'unknown-status', count: '2' },
      { date, status: 'completed', count: '3' },
    ]);
    const result = await service.home(user(['CustomerService.read']));
    expect(
      result.widgets[0].data?.series
        ?.find((s) => s.name === '未识别')
        ?.values.at(-1),
    ).toBe(2);
    expect(
      result.widgets[0].data?.series
        ?.find((s) => s.name === '完成')
        ?.values.at(-1),
    ).toBe(3);
  });
  it('never queries disabled or unauthorized widgets', async () => {
    const { service, db, widgets } = fixture();
    widgets.forEach((w) => (w.enabled = false));
    widgets[1].enabled = true;
    expect((await service.home(user([]))).widgets).toEqual([]);
    expect(db.getRepository).not.toHaveBeenCalled();
    widgets[1].enabled = false;
    expect((await service.home(user(['AgentApp.read']))).widgets).toEqual([]);
    expect(db.getRepository).not.toHaveBeenCalled();
  });
  it('clips mixed cards and links by permission before loading data', async () => {
    const { service, db, widgets } = fixture();
    widgets.forEach(
      (w) =>
        (w.enabled = ['core.metrics', 'quick.actions'].includes(w.widgetKey)),
    );
    const result = await service.home(user(['Product.read']));
    expect(result.widgets[0].data?.metrics?.map((m) => m.key)).toEqual([
      'productTotal',
    ]);
    expect(result.widgets[1].data?.items?.map((i) => i.id)).toEqual([
      'product',
    ]);
    expect(db.getRepository).toHaveBeenCalledTimes(1);
  });
  it('fills missing days and leaves unavailable usage/rates null', async () => {
    const { service, qb } = fixture();
    qb.getRawMany.mockResolvedValue([
      {
        date: '2026-10-19',
        total: '5',
        succeeded: '3',
        failed: '1',
        cancelled: '1',
        tokens: null,
        coverage: '0',
        duration: '30',
        durationCoverage: '2',
      },
    ]);
    const data = await service.agent(7, new Date('2026-10-19T03:00:00Z'));
    expect(data.labels).toHaveLength(7);
    expect(data.series?.[0].values).toEqual([0, 0, 0, 0, 0, 0, 5]);
    expect(data.series?.[1].values).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      75,
    ]);
    expect(data.metrics?.find((m) => m.key === 'tokens')?.value).toBeNull();
    expect(data.metrics?.find((m) => m.key === 'duration')?.value).toBe(15);
    expect(qb.where).toHaveBeenCalledWith(
      expect.stringContaining('FROM_UNIXTIME'),
      expect.objectContaining({
        startEpoch: Math.floor(
          new Date('2026-10-12T16:00:00Z').getTime() / 1000,
        ),
      }),
    );
  });
  it('aggregates only the current user content and material generation tasks', async () => {
    const { service, qb } = fixture();
    const date = shanghaiRange(7, new Date('2026-10-19T03:00:00Z')).dates.at(
      -1,
    );
    qb.getRawMany.mockResolvedValue([
      { date, status: 'succeeded', count: '3' },
      { date, status: 'failed', count: '1' },
      { date, status: 'running', count: '1' },
    ]);
    const data = await service.contentGeneration(
      user(['ContentArticle.read', 'AiMaterial.read']),
      7,
      new Date('2026-10-19T03:00:00Z'),
    );
    expect(data.series?.map((series) => series.values.at(-1))).toEqual([5, 5]);
    expect(data.metrics?.find((m) => m.key === 'generationTotal')?.value).toBe(
      10,
    );
    expect(data.metrics?.find((m) => m.key === 'generationRate')?.value).toBe(
      75,
    );
    expect(qb.where).toHaveBeenCalledWith('r.userId = :userId', { userId: 1 });
  });
  it('isolates failing widgets', async () => {
    const logger = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { service, qb, widgets } = fixture();
    widgets.forEach(
      (w) =>
        (w.enabled = ['agent.executionTrend', 'quick.actions'].includes(
          w.widgetKey,
        )),
    );
    qb.getRawMany.mockRejectedValue(new Error('database failure'));
    const result = await service.home(
      user(['AgentApp.read', 'AgentWorkspace.read']),
    );
    expect(result.widgets.map((w) => w.status)).toEqual([
      'unavailable',
      'ready',
    ]);
    expect(JSON.stringify(result)).not.toContain('database failure');
    logger.mockRestore();
  });
  it('computes Shanghai calendar boundaries independently of host timezone', () => {
    const range = shanghaiRange(7, new Date('2026-10-18T16:00:00Z'));
    expect(range.start.toISOString()).toBe('2026-10-12T16:00:00.000Z');
    expect(range.dates.at(-1)).toBe('2026-10-19');
    expect(
      shanghaiRange(7, new Date('2026-10-18T15:59:59Z')).dates.at(-1),
    ).toBe('2026-10-18');
    expect(successRate(0, 0)).toBeNull();
    expect(successRate(2, 1)).toBe(66.7);
  });
  it('does not count disabled or incomplete knowledge as ready', () => {
    const row = {
      parseStatus: 'success',
      chunkStatus: 'success',
      indexStatus: 'success',
      processStage: 'indexed',
      isEnabled: true,
    };
    expect(knowledgeHealth(row)).toBe('可用');
    expect(knowledgeHealth({ ...row, isEnabled: false })).toBe('待处理 / 停用');
    expect(knowledgeHealth({ ...row, indexStatus: 'failed' })).toBe('异常');
    expect(knowledgeHealth({ ...row, indexStatus: 'new-status' })).toBe(
      '未识别',
    );
  });
});
