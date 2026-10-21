import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DashboardConfigService } from './dashboard-config.service';
import {
  DashboardConfig,
  dashboardWidgetsTransformer,
} from './entities/dashboard-config.entity';
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
    widgets: defaultWidgets(),
    updatedBy: null,
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
    save: jest.fn().mockImplementation(async (value) => value),
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
      async (callback: (value: typeof manager) => Promise<unknown>) =>
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

describe('dashboard immediate configuration', () => {
  it('tolerates empty or malformed legacy widget JSON before service resolution', () => {
    expect(dashboardWidgetsTransformer.from('')).toBeNull();
    expect(dashboardWidgetsTransformer.from('{invalid')).toBeNull();
    expect(dashboardWidgetsTransformer.from('[]')).toEqual([]);
    expect(
      JSON.parse(dashboardWidgetsTransformer.to(defaultWidgets()) as string),
    ).toEqual(defaultWidgets());
  });

  it('does not hydrate an ignored insert and saves the locked persisted entity', async () => {
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
        service.save({ revision, widgets: defaultWidgets() }, user),
      ).resolves.toMatchObject({ revision: revision + 1 });
    }
    expect(insert.updateEntity).toHaveBeenCalledTimes(2);
    expect(insert.updateEntity).toHaveBeenCalledWith(false);
    expect(repo.findOneOrFail).toHaveBeenCalledTimes(2);
    expect(repo.save).toHaveBeenLastCalledWith(row);
    expect(row.id).toBe(1);
  });

  it('saves reordered widgets immediately and records safe audit metadata', async () => {
    const { service, row, audit } = fixture();
    const widgets = defaultWidgets()
      .reverse()
      .map((widget, index) => ({
        ...widget,
        layout: { ...widget.layout, order: index * 10 },
      }));
    widgets[1].enabled = false;

    const saved = await service.save({ revision: 0, widgets }, user);

    expect(saved.widgets).toEqual(widgets);
    expect(row.widgets).toEqual(widgets);
    expect(row.revision).toBe(1);
    expect(audit.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'save',
        operatorId: 1,
        afterData: {
          revision: 1,
          enabledWidgets: widgets.filter((widget) => widget.enabled).length,
        },
      }),
    );
  });

  it('restores default widgets when a legacy row contains no valid configuration', async () => {
    const { service, row } = fixture();
    row.widgets = null;

    await expect(service.read()).resolves.toMatchObject({
      revision: 0,
      widgets: defaultWidgets(),
    });
  });

  it('rejects a stale writer after acquiring the row lock', async () => {
    const { service, repo } = fixture();
    await service.save({ revision: 0, widgets: defaultWidgets() }, user);
    await expect(
      service.save({ revision: 0, widgets: defaultWidgets() }, user),
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
      service.save({ revision: 0, widgets: [] }, user),
    ).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
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

  it('reproduces the missing entity id error when default insert hydration is used', async () => {
    const { createQueryBuilder, query } = ignoredInsert(0);
    await expect(
      createQueryBuilder()
        .insert()
        .values({ key: 'home', widgets: defaultWidgets() })
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
        service.save({ revision: 0, widgets: defaultWidgets() }, user),
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
