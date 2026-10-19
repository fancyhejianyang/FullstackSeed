import { getMetadataArgsStorage } from 'typeorm';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { AiMaterial } from '../ai-materials/entities/ai-material.entity';
import { AddImageToImageMaterials1792400400000 } from './1792400400000-AddImageToImageMaterials';

describe('图生图素材增量迁移', () => {
  function setup() {
    return {
      hasColumn: jest.fn().mockResolvedValue(false),
      addColumn: jest.fn(),
      query: jest.fn().mockResolvedValue([{ total: 0 }]),
      dropColumn: jest.fn(),
    };
  }

  it('幂等增加配置能力、生成模式与参考图字段，并只回填图片配置', async () => {
    const runner = setup();
    const migration = new AddImageToImageMaterials1792400400000();
    await migration.up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledTimes(4);
    expect(runner.query).toHaveBeenCalledWith(
      expect.stringContaining("`featureType` = 'imageGeneration'"),
    );
    runner.hasColumn.mockResolvedValue(true);
    await migration.up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledTimes(4);
    expect(runner.query).toHaveBeenCalledTimes(1);
  });

  it('实体字段默认值与迁移一致', () => {
    const columns = getMetadataArgsStorage().columns;
    const configCapability = columns.find(
      (column) =>
        column.target === AiFeatureConfig &&
        column.propertyName === 'supportsImageToImage',
    );
    const mode = columns.find(
      (column) =>
        column.target === AiMaterial &&
        column.propertyName === 'generationMode',
    );
    expect(configCapability?.options).toMatchObject({
      type: 'tinyint',
      default: false,
    });
    expect(mode?.options).toMatchObject({
      type: 'varchar',
      length: 24,
      default: 'textToImage',
    });
  });

  it('存在图生图业务数据时拒绝回退', async () => {
    const runner = setup();
    const migration = new AddImageToImageMaterials1792400400000();
    runner.hasColumn.mockResolvedValue(true);
    runner.query.mockResolvedValueOnce([{ total: 1 }]);
    await expect(migration.down(runner as never)).rejects.toThrow('人工归档');
    expect(runner.dropColumn).not.toHaveBeenCalled();
  });
});
