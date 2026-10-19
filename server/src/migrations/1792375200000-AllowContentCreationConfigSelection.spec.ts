import { getMetadataArgsStorage } from 'typeorm';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { AllowContentCreationConfigSelection1792375200000 } from './1792375200000-AllowContentCreationConfigSelection';

describe('创作配置多选增量迁移', () => {
  function setup() {
    return {
      getTable: jest.fn().mockResolvedValue({
        indices: [{ name: 'UQ_ai_feature_active_content' }],
      }),
      hasColumn: jest.fn().mockResolvedValue(true),
      dropIndex: jest.fn(),
      dropColumn: jest.fn(),
      addColumn: jest.fn(),
      createIndex: jest.fn(),
      query: jest.fn().mockResolvedValue([{ total: '1' }]),
    };
  }
  it('仅删除派生列和唯一索引；重复执行不影响配置数据', async () => {
    const runner = setup();
    const migration = new AllowContentCreationConfigSelection1792375200000();
    await migration.up(runner as never);
    expect(runner.dropIndex).toHaveBeenCalledWith(
      'ai_feature_configs',
      'UQ_ai_feature_active_content',
    );
    expect(runner.dropColumn).toHaveBeenCalledWith(
      'ai_feature_configs',
      'activeContentKey',
    );
    runner.getTable.mockResolvedValue({ indices: [] });
    runner.hasColumn.mockResolvedValue(false);
    await migration.up(runner as never);
    expect(runner.dropColumn).toHaveBeenCalledTimes(1);
    expect(runner.dropIndex).toHaveBeenCalledTimes(1);
    expect(runner.query).not.toHaveBeenCalled();
  });
  it('回退遇到多个启用配置先拒绝，不静默修改配置', async () => {
    const runner = setup();
    runner.query.mockResolvedValue([{ total: '2' }]);
    const migration = new AllowContentCreationConfigSelection1792375200000();
    await expect(migration.down(runner as never)).rejects.toThrow('手动保留');
    expect(runner.addColumn).not.toHaveBeenCalled();
    expect(runner.createIndex).not.toHaveBeenCalled();
    runner.query.mockResolvedValue([{ total: '1' }]);
    runner.hasColumn.mockResolvedValue(false);
    runner.getTable.mockResolvedValue({ indices: [] });
    await migration.down(runner as never);
    expect(runner.addColumn).toHaveBeenCalledTimes(1);
    expect(runner.createIndex).toHaveBeenCalledTimes(1);
  });
  it('实体元数据不再重新创建单例列或索引', () => {
    const metadata = getMetadataArgsStorage();
    expect(
      metadata.indices
        .filter((i) => i.target === AiFeatureConfig)
        .some((i) => i.name === 'UQ_ai_feature_active_content'),
    ).toBe(false);
    expect(
      metadata.columns
        .filter((i) => i.target === AiFeatureConfig)
        .some((i) => i.propertyName === 'activeContentKey'),
    ).toBe(false);
  });
});
