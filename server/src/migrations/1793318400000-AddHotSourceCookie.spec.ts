import { AddHotSourceCookie1793318400000 } from './1793318400000-AddHotSourceCookie';

describe('热点来源私密 Cookie 列迁移', () => {
  it('仅补缺失列，可重复执行，不改写原有凭据', async () => {
    const columns = new Set<string>();
    const runner = {
      hasTable: jest.fn().mockResolvedValue(true),
      hasColumn: jest.fn((_table: string, name: string) => columns.has(name)),
      addColumn: jest.fn((_table: string, column: { name: string }) =>
        columns.add(column.name),
      ),
    };
    const migration = new AddHotSourceCookie1793318400000();
    await migration.up(runner as never);
    await migration.up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledTimes(2);
    expect(runner.addColumn.mock.calls[0][1]).toMatchObject({
      name: 'cookieEncrypted',
      type: 'mediumtext',
      isNullable: true,
    });
    await migration.down();
    expect(columns.size).toBe(2);
  });
  it('尚无来源表则跳过', async () => {
    const runner = {
      hasTable: jest.fn().mockResolvedValue(false),
      addColumn: jest.fn(),
    };
    await new AddHotSourceCookie1793318400000().up(runner as never);
    expect(runner.addColumn).not.toHaveBeenCalled();
  });
});
