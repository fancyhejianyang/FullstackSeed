import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DashboardConfigService } from './dashboard-config.service';
import { DashboardConfig } from './entities/dashboard-config.entity';
import { defaultWidgets } from './dashboard.registry';
const user = {
  userId: 1,
  username: 'admin',
  isAdmin: true,
  roles: [],
  permissions: [],
};
function fixture(createQueryBuilder?: () => unknown) {
  const row: DashboardConfig = Object.assign(new DashboardConfig(), {
    id: 1,
    key: 'home',
    revision: 0,
    publishedVersion: 0,
    draft: defaultWidgets(),
    published: defaultWidgets(),
    previous: null,
    publishedAt: null,
  });
  const insert = {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    updateEntity: jest.fn<unknown, [boolean]>().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
  };
  const repo = {
    createQueryBuilder: jest.fn(createQueryBuilder ?? (() => insert)),
    findOneOrFail: jest.fn().mockResolvedValue(row),
    findOneBy: jest.fn().mockResolvedValue(row),
    save: jest.fn().mockResolvedValue(row),
  };
  const audit = { save: jest.fn().mockResolvedValue({}) };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === DashboardConfig ? repo : audit,
    ),
  };
  const db = {
    getRepository: jest.fn(() => repo),
    transaction: jest.fn(
      async (callback: (m: typeof manager) => Promise<void>) =>
        callback(manager),
    ),
  };
  return {
    row,
    insert,
    repo,
    audit,
    db,
    service: new DashboardConfigService(db as unknown as DataSource),
  };
}
describe('dashboard draft, publication and rollback', () => {
  it('does not reload an ignored insert and always saves the locked persisted entity', async () => {
    const { service, row, insert, repo } = fixture();
    insert.execute.mockImplementation(() => {
      if (insert.updateEntity.mock.lastCall?.[0] !== false) {
        return Promise.reject(
          new Error(
            'Cannot update entity because entity id is not set in the entity.',
          ),
        );
      }
      return Promise.resolve({ raw: { insertId: 0, affectedRows: 0 } });
    });
    for (const revision of [0, 1]) {
      await expect(
        service.change({ revision, widgets: defaultWidgets() }, 'save', user),
      ).resolves.toMatchObject({ revision: revision + 1 });
    }
    expect(insert.updateEntity).toHaveBeenCalledTimes(2);
    expect(insert.updateEntity).toHaveBeenCalledWith(false);
    expect(repo.findOneOrFail).toHaveBeenCalledTimes(2);
    expect(repo.save).toHaveBeenLastCalledWith(row);
    expect(row.id).toBe(1);
  });
  it('persists reordered drafts separately, publishes order, and restores the previous order on rollback', async () => {
    const { service, row } = fixture();
    const original = defaultWidgets();
    const widgets = [...original].reverse().map((widget, index) => ({
      ...widget,
      layout: { ...widget.layout, order: index * 10 },
    }));
    const saved = await service.change({ revision: 0, widgets }, 'save', user);
    expect(saved.draft).toEqual(widgets);
    expect(saved.published).toEqual(original);
    const published = await service.change(
      { revision: 1, widgets },
      'publish',
      user,
    );
    expect(published.published).toEqual(widgets);
    const rolledBack = await service.change({ revision: 2 }, 'rollback', user);
    expect(rolledBack.published).toEqual(original);
    expect(rolledBack.draft).toEqual(original);
    expect(row.revision).toBe(3);
  });
  it('does not publish a draft; publish and rollback increment versions and write safe audit metadata', async () => {
    const { service, row, audit } = fixture();
    const widgets = defaultWidgets();
    widgets[1].enabled = false;
    await service.change({ revision: 0, widgets }, 'save', user);
    expect(row.published[1].enabled).toBe(true);
    expect(row.publishedVersion).toBe(0);
    await service.change({ revision: 1, widgets }, 'publish', user);
    expect(row.published[1].enabled).toBe(false);
    expect(row.publishedVersion).toBe(1);
    await service.change({ revision: 2 }, 'rollback', user);
    expect(row.published[1].enabled).toBe(true);
    expect(row.publishedVersion).toBe(2);
    expect(row.draft).toEqual(row.published);
    expect(row.revision).toBe(3);
    expect(audit.save).toHaveBeenCalledTimes(3);
    expect(audit.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'rollback',
        operatorId: 1,
        afterData: { revision: 3, publishedVersion: 2, enabledWidgets: 10 },
      }),
    );
  });
  it('rejects a stale writer after acquiring the row lock', async () => {
    const { service, repo } = fixture();
    await service.change(
      { revision: 0, widgets: defaultWidgets() },
      'publish',
      user,
    );
    await expect(
      service.change(
        { revision: 0, widgets: defaultWidgets() },
        'publish',
        user,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.findOneOrFail).toHaveBeenCalledWith({
      where: { key: 'home' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(repo.save).toHaveBeenCalledTimes(1);
  });
  it('does not start a transaction for illegal configuration', async () => {
    const { service, db } = fixture();
    await expect(
      service.change({ revision: 0, widgets: [] }, 'publish', user),
    ).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('rejects rollback without history', async () => {
    const { service, repo } = fixture();
    await expect(
      service.change({ revision: 0 }, 'rollback', user),
    ).rejects.toThrow('暂无可回退版本');
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('upgrades an older saved widget schema during rollback', async () => {
    const { service, row } = fixture();
    row.previous = defaultWidgets()
      .filter(
        (widget) =>
          !['generation.health', 'creation.recent'].includes(widget.widgetKey),
      )
      .map((widget) =>
        widget.widgetKey === 'content.generationTrend'
          ? { ...widget, schemaVersion: 1, params: { days: 7 } }
          : widget,
      );
    await expect(
      service.change({ revision: 0 }, 'rollback', user),
    ).resolves.toBeDefined();
    expect(row.published).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          widgetKey: 'content.generationTrend',
          schemaVersion: 2,
        }),
        expect.objectContaining({
          widgetKey: 'generation.health',
          enabled: false,
        }),
      ]),
    );
  });
});

// 使用真实 MySQL 查询构造器，仅模拟 SQL 回执，不初始化数据库连接。
class OfflineDashboardDataSource extends DataSource {
  async prepareMetadata() {
    await this.buildMetadatas();
  }
}

describe('dashboard initialization with real TypeORM insert handling', () => {
  const db = new OfflineDashboardDataSource({
    type: 'mysql',
    database: 'dashboard_offline_test',
    entities: [DashboardConfig],
  });
  beforeAll(() => db.prepareMetadata());

  function ignoredInsert(insertId: number) {
    const runner = db.createQueryRunner();
    const query = jest.spyOn(runner, 'query').mockResolvedValue({
      raw: { insertId, affectedRows: insertId ? 1 : 0 },
      records: [],
      affected: insertId ? 1 : 0,
    });
    return {
      query,
      createQueryBuilder: () =>
        db.createQueryBuilder(DashboardConfig, 'config', runner),
    };
  }

  it('reproduces the missing entity id error for an ignored insert with default hydration', async () => {
    const { createQueryBuilder, query } = ignoredInsert(0);
    await expect(
      createQueryBuilder()
        .insert()
        .values({
          key: 'home',
          draft: defaultWidgets(),
          published: defaultWidgets(),
        })
        .orIgnore()
        .execute(),
    ).rejects.toThrow(
      'Cannot update entity because entity id is not set in the entity.',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([1, 0])(
    'saves through the real insert path when MySQL returns insertId=%i',
    async (insertId) => {
      const { createQueryBuilder, query } = ignoredInsert(insertId);
      const { service, repo } = fixture(createQueryBuilder);
      await expect(
        service.change(
          { revision: 0, widgets: defaultWidgets() },
          'save',
          user,
        ),
      ).resolves.toMatchObject({ revision: 1 });
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0]?.[0]).toMatch(/^INSERT\s+IGNORE INTO/);
      expect(repo.findOneOrFail).toHaveBeenCalledWith({
        where: { key: 'home' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
      );
    },
  );
});
