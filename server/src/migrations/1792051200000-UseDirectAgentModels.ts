import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class UseDirectAgentModels1792051200000 implements MigrationInterface {
  name = 'UseDirectAgentModels1792051200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('agent_apps'))) return;

    if (!(await queryRunner.hasColumn('agent_apps', 'providerId'))) {
      await queryRunner.addColumn(
        'agent_apps',
        new TableColumn({ name: 'providerId', type: 'int', isNullable: true }),
      );
    }
    if (!(await queryRunner.hasColumn('agent_apps', 'providerName'))) {
      await queryRunner.addColumn(
        'agent_apps',
        new TableColumn({
          name: 'providerName',
          type: 'varchar',
          length: '120',
          isNullable: true,
        }),
      );
    }
    if (!(await queryRunner.hasColumn('agent_apps', 'models'))) {
      await queryRunner.addColumn(
        'agent_apps',
        new TableColumn({ name: 'models', type: 'text', isNullable: true }),
      );
    }

    const hasLegacyConfig = await queryRunner.hasColumn(
      'agent_apps',
      'aiFeatureConfigId',
    );
    if (hasLegacyConfig && (await queryRunner.hasTable('ai_feature_configs'))) {
      const hasProviders = await queryRunner.hasTable('knowledge_ai_providers');
      await queryRunner.query(`
        UPDATE \`agent_apps\` app
        LEFT JOIN \`ai_feature_configs\` config
          ON config.\`id\` = app.\`aiFeatureConfigId\`
        ${
          hasProviders
            ? 'LEFT JOIN `knowledge_ai_providers` provider ON provider.`id` = config.`providerId`'
            : ''
        }
        SET
          app.\`providerId\` = COALESCE(config.\`providerId\`, 0),
          app.\`providerName\` = COALESCE(${hasProviders ? 'provider.`name`,' : ''} config.\`providerName\`, '待重新配置'),
          app.\`models\` = CASE
            WHEN config.\`model\` IS NULL OR TRIM(config.\`model\`) = '' THEN '[]'
            ELSE CONCAT('[', JSON_QUOTE(config.\`model\`), ']')
          END
        WHERE app.\`providerId\` IS NULL
      `);
    }
    await queryRunner.query(`
      UPDATE \`agent_apps\`
      SET
        \`providerId\` = COALESCE(\`providerId\`, 0),
        \`providerName\` = COALESCE(NULLIF(\`providerName\`, ''), '待重新配置'),
        \`models\` = COALESCE(NULLIF(\`models\`, ''), '[]')
    `);

    await queryRunner.changeColumn(
      'agent_apps',
      'providerId',
      new TableColumn({ name: 'providerId', type: 'int', isNullable: false }),
    );
    await queryRunner.changeColumn(
      'agent_apps',
      'providerName',
      new TableColumn({
        name: 'providerName',
        type: 'varchar',
        length: '120',
        isNullable: false,
      }),
    );
    await queryRunner.changeColumn(
      'agent_apps',
      'models',
      new TableColumn({ name: 'models', type: 'text', isNullable: false }),
    );

    if (hasLegacyConfig) {
      await queryRunner.changeColumn(
        'agent_apps',
        'aiFeatureConfigId',
        new TableColumn({
          name: 'aiFeatureConfigId',
          type: 'int',
          isNullable: true,
        }),
      );
      await queryRunner.changeColumn(
        'agent_apps',
        'aiFeatureConfigName',
        new TableColumn({
          name: 'aiFeatureConfigName',
          type: 'varchar',
          length: '120',
          isNullable: true,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('agent_apps'))) return;
    if (await queryRunner.hasColumn('agent_apps', 'aiFeatureConfigId')) {
      await queryRunner.query(`
        UPDATE \`agent_apps\`
        SET
          \`aiFeatureConfigId\` = COALESCE(\`aiFeatureConfigId\`, 0),
          \`aiFeatureConfigName\` = COALESCE(NULLIF(\`aiFeatureConfigName\`, ''), '待重新配置')
      `);
      await queryRunner.changeColumn(
        'agent_apps',
        'aiFeatureConfigId',
        new TableColumn({
          name: 'aiFeatureConfigId',
          type: 'int',
          isNullable: false,
        }),
      );
      await queryRunner.changeColumn(
        'agent_apps',
        'aiFeatureConfigName',
        new TableColumn({
          name: 'aiFeatureConfigName',
          type: 'varchar',
          length: '120',
          isNullable: false,
        }),
      );
    }
    for (const column of ['models', 'providerName', 'providerId']) {
      if (await queryRunner.hasColumn('agent_apps', column)) {
        await queryRunner.dropColumn('agent_apps', column);
      }
    }
  }
}
