import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddVideoGenerationMaterials1792569600000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const additions: Array<[string, TableColumn]> = [
      [
        'knowledge_ai_providers',
        new TableColumn({
          name: 'videoGenerationModels',
          type: 'text',
          isNullable: true,
        }),
      ],
      [
        'knowledge_ai_providers',
        new TableColumn({
          name: 'videoGenerationApiUrl',
          type: 'varchar',
          length: '500',
          isNullable: true,
        }),
      ],
      [
        'ai_feature_configs',
        new TableColumn({
          name: 'supportsImageToVideo',
          type: 'tinyint',
          default: 0,
        }),
      ],
      [
        'ai_materials',
        new TableColumn({
          name: 'mediaType',
          type: 'varchar',
          length: '12',
          default: "'image'",
        }),
      ],
      [
        'ai_materials',
        new TableColumn({
          name: 'currentMediaType',
          type: 'varchar',
          length: '12',
          isNullable: true,
        }),
      ],
      [
        'ai_materials',
        new TableColumn({
          name: 'videoResolution',
          type: 'varchar',
          length: '12',
          default: "'720P'",
        }),
      ],
      [
        'ai_materials',
        new TableColumn({
          name: 'videoRatio',
          type: 'varchar',
          length: '12',
          default: "'16:9'",
        }),
      ],
      [
        'ai_materials',
        new TableColumn({ name: 'videoDuration', type: 'int', default: 5 }),
      ],
      [
        'material_generation_tasks',
        new TableColumn({
          name: 'providerTaskId',
          type: 'varchar',
          length: '100',
          isNullable: true,
        }),
      ],
    ];
    for (const [table, column] of additions) {
      if (!(await runner.hasColumn(table, column.name)))
        await runner.addColumn(table, column);
    }
    await runner.query(
      "UPDATE `ai_materials` SET `mediaType` = 'image' WHERE `mediaType` IS NULL OR `mediaType` = ''",
    );
    await runner.query(
      "UPDATE `ai_materials` SET `currentMediaType` = 'image' WHERE `currentMediaType` IS NULL AND (`currentFileId` IS NOT NULL OR `currentImageUrl` IS NOT NULL)",
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    if (await runner.hasColumn('ai_materials', 'mediaType')) {
      const conditions = ["`mediaType` = 'video'"];
      if (await runner.hasColumn('ai_materials', 'currentMediaType'))
        conditions.push("`currentMediaType` = 'video'");
      if (await runner.hasColumn('ai_materials', 'generationMode'))
        conditions.push("`generationMode` IN ('textToVideo', 'imageToVideo')");
      const rows = (await runner.query(
        `SELECT COUNT(*) AS total FROM \`ai_materials\` WHERE ${conditions.join(' OR ')}`,
      )) as Array<{ total: string | number }>;
      if (Number(rows[0]?.total ?? 0) > 0)
        throw new Error('已有视频素材，请人工归档后回退；不会自动删除视频。');
    }
    if (await runner.hasColumn('ai_feature_configs', 'supportsImageToVideo')) {
      const rows = (await runner.query(
        "SELECT COUNT(*) AS total FROM `ai_feature_configs` WHERE `featureType` = 'videoGeneration' OR `supportsImageToVideo` = 1",
      )) as Array<{ total: string | number }>;
      if (Number(rows[0]?.total ?? 0) > 0)
        throw new Error('已有视频生成配置，请人工确认后回退。');
    }
    const providerConditions: string[] = [];
    if (
      await runner.hasColumn('knowledge_ai_providers', 'videoGenerationModels')
    )
      providerConditions.push("COALESCE(`videoGenerationModels`, '') <> ''");
    if (
      await runner.hasColumn('knowledge_ai_providers', 'videoGenerationApiUrl')
    )
      providerConditions.push("COALESCE(`videoGenerationApiUrl`, '') <> ''");
    if (providerConditions.length) {
      const rows = (await runner.query(
        `SELECT COUNT(*) AS total FROM \`knowledge_ai_providers\` WHERE ${providerConditions.join(' OR ')}`,
      )) as Array<{ total: string | number }>;
      if (Number(rows[0]?.total ?? 0) > 0)
        throw new Error('已有视频模型账号配置，请人工确认后回退。');
    }
    if (await runner.hasColumn('material_generation_tasks', 'providerTaskId')) {
      const rows = (await runner.query(
        'SELECT COUNT(*) AS total FROM `material_generation_tasks` WHERE `providerTaskId` IS NOT NULL',
      )) as Array<{ total: string | number }>;
      if (Number(rows[0]?.total ?? 0) > 0)
        throw new Error('已有供应商视频任务记录，请人工确认后回退。');
    }
    for (const [table, name] of [
      ['material_generation_tasks', 'providerTaskId'],
      ['ai_materials', 'videoDuration'],
      ['ai_materials', 'videoRatio'],
      ['ai_materials', 'videoResolution'],
      ['ai_materials', 'currentMediaType'],
      ['ai_materials', 'mediaType'],
      ['ai_feature_configs', 'supportsImageToVideo'],
      ['knowledge_ai_providers', 'videoGenerationApiUrl'],
      ['knowledge_ai_providers', 'videoGenerationModels'],
    ] as const) {
      if (await runner.hasColumn(table, name))
        await runner.dropColumn(table, name);
    }
  }
}
