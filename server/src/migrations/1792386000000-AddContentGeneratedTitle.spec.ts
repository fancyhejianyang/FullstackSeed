import { getMetadataArgsStorage } from 'typeorm';
import { ContentGenerationTask } from '../content-articles/entities/content-generation-task.entity';
import { AddContentGeneratedTitle1792386000000 } from './1792386000000-AddContentGeneratedTitle';

describe('生成标题增量迁移', () => {
  it('只添加可空列，重复执行不覆盖历史数据，实体字段一致', async () => {
    const runner = {
      hasColumn: jest.fn().mockResolvedValue(false),
      addColumn: jest.fn(),
      query: jest.fn(),
    };
    const migration = new AddContentGeneratedTitle1792386000000();
    await migration.up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledWith(
      'content_generation_tasks',
      expect.objectContaining({
        name: 'generatedTitle',
        type: 'varchar',
        length: '160',
        isNullable: true,
      }),
    );
    runner.hasColumn.mockResolvedValue(true);
    await migration.up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledTimes(1);
    expect(runner.query).not.toHaveBeenCalled();
    expect(
      getMetadataArgsStorage().columns.find(
        (column) =>
          column.target === ContentGenerationTask &&
          column.propertyName === 'generatedTitle',
      )?.options,
    ).toMatchObject({ type: 'varchar', length: 160, nullable: true });
  });
  it('有生成标题时禁止破坏性回退；无数据或无列安全处理', async () => {
    const runner = {
      hasColumn: jest.fn().mockResolvedValue(false),
      query: jest.fn().mockResolvedValue([{ total: 1 }]),
      dropColumn: jest.fn(),
    };
    const migration = new AddContentGeneratedTitle1792386000000();
    await migration.down(runner as never);
    expect(runner.query).not.toHaveBeenCalled();
    runner.hasColumn.mockResolvedValue(true);
    await expect(migration.down(runner as never)).rejects.toThrow('人工归档');
    expect(runner.dropColumn).not.toHaveBeenCalled();
    runner.query.mockResolvedValue([{ total: 0 }]);
    await migration.down(runner as never);
    expect(runner.dropColumn).toHaveBeenCalledWith(
      'content_generation_tasks',
      'generatedTitle',
    );
  });
});
