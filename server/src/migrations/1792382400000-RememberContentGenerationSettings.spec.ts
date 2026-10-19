import { RememberContentGenerationSettings1792382400000 } from './1792382400000-RememberContentGenerationSettings';

function setup(existing: string[] = []) {
  const columns = new Set(existing);
  return {
    hasColumn: jest.fn((_table: string, name: string) =>
      Promise.resolve(columns.has(name)),
    ),
    addColumn: jest.fn((_table: string, column: { name: string }) => {
      columns.add(column.name);
      return Promise.resolve();
    }),
    hasTable: jest.fn().mockResolvedValue(true),
    query: jest.fn().mockResolvedValue([{ total: 0 }]),
    dropColumn: jest.fn().mockResolvedValue(undefined),
  };
}
describe('文章生成设置迁移', () => {
  it('首次添加可空整数列，从本人最新未删除任务回填；重复执行不改偏好', async () => {
    const runner = setup();
    const migration = new RememberContentGenerationSettings1792382400000();
    await migration.up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledTimes(2);
    expect(runner.addColumn).toHaveBeenCalledWith(
      'content_articles',
      expect.objectContaining({
        name: 'aiConfigId',
        type: 'int',
        isNullable: true,
      }),
    );
    const sql = runner.query.mock.calls[0] as unknown as [string];
    expect(sql[0]).toContain('recent.userId = article.userId');
    expect(sql[0]).toContain('MAX(id)');
    expect(sql[0]).toContain('article.aiConfigId IS NULL');
    await migration.up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledTimes(2);
    expect(runner.query).toHaveBeenCalledTimes(1);
  });
  it('已有偏好时拒绝有损回退，空列可回退', async () => {
    const runner = setup(['aiConfigId', 'templateId']);
    const migration = new RememberContentGenerationSettings1792382400000();
    runner.query.mockResolvedValueOnce([{ total: 1 }]);
    await expect(migration.down(runner as never)).rejects.toThrow('人工归档');
    expect(runner.dropColumn).not.toHaveBeenCalled();
    await migration.down(runner as never);
    expect(runner.dropColumn).toHaveBeenCalledTimes(2);
  });
});
