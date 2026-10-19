import { AddContentCover1792393200000 } from './1792393200000-AddContentCover';

describe('封面任务增量迁移', () => {
  function setup() {
    return {
      hasColumn: jest.fn().mockResolvedValue(false),
      addColumn: jest.fn(),
      getTable: jest.fn().mockResolvedValue({ indices: [] }),
      createIndex: jest.fn(),
      query: jest.fn().mockResolvedValue([{ total: 0 }]),
      dropColumn: jest.fn(),
      dropIndex: jest.fn(),
    };
  }
  it('可空列与索引幂等，不回填或重跑历史任务', async () => {
    const runner = setup();
    const migration = new AddContentCover1792393200000();
    await migration.up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledTimes(2);
    expect(runner.addColumn).toHaveBeenCalledWith(
      'content_generation_tasks',
      expect.objectContaining({
        name: 'coverData',
        type: 'json',
        isNullable: true,
      }),
    );
    runner.hasColumn.mockResolvedValue(true);
    runner.getTable.mockResolvedValue({
      indices: [{ name: 'IDX_content_cover_queue' }],
    });
    await migration.up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledTimes(2);
    expect(runner.createIndex).toHaveBeenCalledTimes(1);
    expect(runner.query).not.toHaveBeenCalled();
  });
  it('有封面数据拒绝回退，无数据可回退', async () => {
    const runner = setup();
    const migration = new AddContentCover1792393200000();
    runner.hasColumn.mockResolvedValue(true);
    runner.query.mockResolvedValue([{ total: 1 }]);
    await expect(migration.down(runner as never)).rejects.toThrow('人工归档');
    expect(runner.dropColumn).not.toHaveBeenCalled();
    runner.query.mockResolvedValue([{ total: 0 }]);
    await migration.down(runner as never);
    expect(runner.dropColumn).toHaveBeenCalledTimes(2);
  });
});
