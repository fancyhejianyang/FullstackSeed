import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddImageToImageMaterials1792400400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (
      !(await runner.hasColumn('ai_feature_configs', 'supportsImageToImage'))
    ) {
      await runner.addColumn(
        'ai_feature_configs',
        new TableColumn({
          name: 'supportsImageToImage',
          type: 'tinyint',
          default: 0,
        }),
      );
      await runner.query(
        "UPDATE `ai_feature_configs` SET `supportsImageToImage` = 1 WHERE `featureType` = 'imageGeneration'",
      );
    }

    for (const column of [
      new TableColumn({
        name: 'generationMode',
        type: 'varchar',
        length: '24',
        default: "'textToImage'",
      }),
      new TableColumn({
        name: 'referenceFileId',
        type: 'int',
        isNullable: true,
      }),
      new TableColumn({
        name: 'referenceImageUrl',
        type: 'varchar',
        length: '2048',
        isNullable: true,
      }),
    ]) {
      if (!(await runner.hasColumn('ai_materials', column.name)))
        await runner.addColumn('ai_materials', column);
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    const materialDataConditions: string[] = [];
    if (await runner.hasColumn('ai_materials', 'generationMode'))
      materialDataConditions.push("`generationMode` <> 'textToImage'");
    if (await runner.hasColumn('ai_materials', 'referenceFileId'))
      materialDataConditions.push('`referenceFileId` IS NOT NULL');
    if (await runner.hasColumn('ai_materials', 'referenceImageUrl'))
      materialDataConditions.push('`referenceImageUrl` IS NOT NULL');
    if (materialDataConditions.length) {
      const rows = (await runner.query(
        `SELECT COUNT(*) AS total FROM \`ai_materials\` WHERE ${materialDataConditions.join(' OR ')}`,
      )) as Array<{ total: string | number }>;
      if (Number(rows[0]?.total ?? 0) > 0)
        throw new Error(
          '已有图生图素材或参考图片，请人工归档后回退；不会自动删除源图。',
        );
    }
    if (await runner.hasColumn('ai_feature_configs', 'supportsImageToImage')) {
      const rows = (await runner.query(
        "SELECT COUNT(*) AS total FROM `ai_feature_configs` WHERE `featureType` = 'imageGeneration' AND `supportsImageToImage` = 0",
      )) as Array<{ total: string | number }>;
      if (Number(rows[0]?.total ?? 0) > 0)
        throw new Error(
          '已有图片生成配置关闭图生图能力，请人工确认后回退；不会自动丢弃配置。',
        );
    }
    for (const name of [
      'referenceImageUrl',
      'referenceFileId',
      'generationMode',
    ]) {
      if (await runner.hasColumn('ai_materials', name))
        await runner.dropColumn('ai_materials', name);
    }
    if (await runner.hasColumn('ai_feature_configs', 'supportsImageToImage'))
      await runner.dropColumn('ai_feature_configs', 'supportsImageToImage');
  }
}
