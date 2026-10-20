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
function fixture() {
  const row = Object.assign(new DashboardConfig(), {
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
    execute: jest.fn().mockResolvedValue({}),
  };
  const repo = {
    createQueryBuilder: jest.fn(() => insert),
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
    repo,
    audit,
    db,
    service: new DashboardConfigService(db as unknown as DataSource),
  };
}
describe('dashboard draft, publication and rollback', () => {
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
