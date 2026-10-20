import { getMetadataArgsStorage } from 'typeorm';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { AiMaterial } from '../ai-materials/entities/ai-material.entity';
import { MaterialGenerationTask } from '../ai-materials/entities/material-generation-task.entity';
import { KnowledgeAiProvider } from '../knowledge-ai-providers/entities/knowledge-ai-provider.entity';
import { AddVideoGenerationMaterials1792569600000 } from './1792569600000-AddVideoGenerationMaterials';

describe('视频生成素材增量迁移', () => {
  const setup = () => ({
    hasColumn: jest.fn().mockResolvedValue(false),
    addColumn: jest.fn(),
    query: jest.fn().mockResolvedValue([{ total: 0 }]),
    dropColumn: jest.fn(),
  });

  it('幂等增加账号、配置、素材和任务字段', async () => {
    const runner = setup();
    const migration = new AddVideoGenerationMaterials1792569600000();
    await migration.up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledTimes(9);
    expect(runner.query).toHaveBeenCalledTimes(2);
    runner.hasColumn.mockResolvedValue(true);
    await migration.up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledTimes(9);
  });

  it('实体包含迁移新增字段', () => {
    const columns = getMetadataArgsStorage().columns;
    for (const [target, property] of [
      [KnowledgeAiProvider, 'videoGenerationModels'],
      [KnowledgeAiProvider, 'videoGenerationApiUrl'],
      [AiFeatureConfig, 'supportsImageToVideo'],
      [AiMaterial, 'mediaType'],
      [AiMaterial, 'currentMediaType'],
      [AiMaterial, 'videoResolution'],
      [AiMaterial, 'videoRatio'],
      [AiMaterial, 'videoDuration'],
      [MaterialGenerationTask, 'providerTaskId'],
    ] as const)
      expect(
        columns.some(
          (column) =>
            column.target === target && column.propertyName === property,
        ),
      ).toBe(true);
  });

  it('存在视频素材时拒绝回退', async () => {
    const runner = setup();
    runner.hasColumn.mockResolvedValue(true);
    runner.query.mockResolvedValueOnce([{ total: 1 }]);
    await expect(
      new AddVideoGenerationMaterials1792569600000().down(runner as never),
    ).rejects.toThrow('人工归档');
  });
});
