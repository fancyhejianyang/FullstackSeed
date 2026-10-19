import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

/** 不修改历史迁移；仅移除派生的单例约束，保留所有配置及任务快照。 */
export class AllowContentCreationConfigSelection1792375200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const table = await runner.getTable('ai_feature_configs');
    if (
      table?.indices.some(
        (index) => index.name === 'UQ_ai_feature_active_content',
      )
    )
      await runner.dropIndex(
        'ai_feature_configs',
        'UQ_ai_feature_active_content',
      );
    if (await runner.hasColumn('ai_feature_configs', 'activeContentKey'))
      await runner.dropColumn('ai_feature_configs', 'activeContentKey');
  }

  async down(runner: QueryRunner): Promise<void> {
    const rows = (await runner.query(
      "SELECT COUNT(*) AS total FROM ai_feature_configs WHERE featureType = 'contentCreation' AND isEnabled = 1 AND deletedAt IS NULL",
    )) as Array<{ total: number | string }>;
    if (Number(rows[0]?.total ?? 0) > 1)
      throw new Error(
        '回退前请手动保留至多一个启用的内容创作配置；不会自动停用配置',
      );
    if (!(await runner.hasColumn('ai_feature_configs', 'activeContentKey')))
      await runner.addColumn(
        'ai_feature_configs',
        new TableColumn({
          name: 'activeContentKey',
          type: 'varchar',
          length: '40',
          isNullable: true,
          asExpression:
            "CASE WHEN featureType = 'contentCreation' AND isEnabled = 1 AND deletedAt IS NULL THEN 'contentCreation' ELSE NULL END",
          generatedType: 'STORED',
        }),
      );
    const table = await runner.getTable('ai_feature_configs');
    if (
      !table?.indices.some(
        (index) => index.name === 'UQ_ai_feature_active_content',
      )
    )
      await runner.createIndex(
        'ai_feature_configs',
        new TableIndex({
          name: 'UQ_ai_feature_active_content',
          columnNames: ['activeContentKey'],
          isUnique: true,
        }),
      );
  }
}
