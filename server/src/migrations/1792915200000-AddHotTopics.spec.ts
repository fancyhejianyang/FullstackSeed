import { AddHotTopics1792915200000 } from './1792915200000-AddHotTopics';
import type { Table, TableColumn } from 'typeorm';

function setup() {
  const tables = new Set(['ai_feature_configs', 'content_articles']);
  const columns = new Set<string>();
  return {
    hasTable: jest.fn((name: string) => Promise.resolve(tables.has(name))),
    hasColumn: jest.fn((table: string, name: string) =>
      Promise.resolve(columns.has(`${table}.${name}`)),
    ),
    createTable: jest.fn((table: Table) => {
      tables.add(table.name);
      return Promise.resolve();
    }),
    addColumn: jest.fn((table: string, column: TableColumn) => {
      columns.add(`${table}.${column.name}`);
      return Promise.resolve();
    }),
    query: jest.fn().mockResolvedValue([{ total: 0 }]),
    dropTable: jest.fn(),
    dropColumn: jest.fn(),
  };
}
describe('热点选题迁移', () => {
  it('创建四张独立表与来源列，重复运行不覆盖数据或开启计划', async () => {
    const runner = setup();
    const migration = new AddHotTopics1792915200000();
    await migration.up(runner as never);
    await migration.up(runner as never);
    expect(runner.createTable).toHaveBeenCalledTimes(4);
    expect(runner.addColumn).toHaveBeenCalledTimes(3);
    const topics = runner.createTable.mock.calls
      .map(([table]) => table)
      .find((table) => table.name === 'hot_topics');
    expect(
      topics?.columns.find((column) => column.name === 'candidates')?.type,
    ).toBe('json');
    const preferences = runner.createTable.mock.calls
      .map(([table]) => table)
      .find((table) => table.name === 'hot_topic_preferences');
    expect(
      preferences?.columns.find((column) => column.name === 'scheduleEnabled')
        ?.default,
    ).toBe(0);
    const runs = runner.createTable.mock.calls
      .map(([table]) => table)
      .find((table) => table.name === 'hot_topic_runs');
    expect(runs?.indices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columnNames: ['activeUserId'],
          isUnique: true,
        }),
      ]),
    );
  });
  it('有业务数据时在任何删除动作前拒绝回退', async () => {
    const runner = setup();
    const migration = new AddHotTopics1792915200000();
    await migration.up(runner as never);
    runner.query.mockResolvedValueOnce([{ total: 1 }]);
    await expect(migration.down(runner as never)).rejects.toThrow('人工归档');
    expect(runner.dropColumn).not.toHaveBeenCalled();
    expect(runner.dropTable).not.toHaveBeenCalled();
  });
});
