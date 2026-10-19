import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddContentGenerationTasks1792371600000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const base = () => [
      {
        name: 'id',
        type: 'int',
        isPrimary: true,
        isGenerated: true,
        generationStrategy: 'increment' as const,
      },
      {
        name: 'createdAt',
        type: 'timestamp',
        precision: 6,
        default: 'CURRENT_TIMESTAMP(6)',
      },
      {
        name: 'updatedAt',
        type: 'timestamp',
        precision: 6,
        default: 'CURRENT_TIMESTAMP(6)',
        onUpdate: 'CURRENT_TIMESTAMP(6)',
      },
      { name: 'deletedAt', type: 'timestamp', precision: 6, isNullable: true },
    ];
    if (!(await runner.hasTable('content_templates'))) {
      await runner.createTable(
        new Table({
          name: 'content_templates',
          columns: [
            ...base(),
            { name: 'userId', type: 'int' },
            { name: 'name', type: 'varchar', length: '120' },
            { name: 'instruction', type: 'text' },
          ],
          indices: [
            { name: 'IDX_content_templates_owner', columnNames: ['userId'] },
          ],
        }),
      );
    }
    if (!(await runner.hasTable('content_generation_tasks'))) {
      await runner.createTable(
        new Table({
          name: 'content_generation_tasks',
          columns: [
            ...base(),
            ...['userId', 'articleId', 'articleVersion'].map((name) => ({
              name,
              type: 'int',
            })),
            { name: 'requestId', type: 'varchar', length: '36' },
            {
              name: 'status',
              type: 'varchar',
              length: '20',
              default: "'pending'",
            },
            ...['activeArticleId', 'activeUserId', 'totalTokens'].map(
              (name) => ({ name, type: 'int', isNullable: true }),
            ),
            { name: 'snapshot', type: 'json' },
            { name: 'result', type: 'mediumtext', isNullable: true },
            {
              name: 'errorMessage',
              type: 'varchar',
              length: '300',
              isNullable: true,
            },
            {
              name: 'workerId',
              type: 'varchar',
              length: '36',
              isNullable: true,
            },
            ...['leaseExpiresAt', 'startedAt', 'finishedAt'].map((name) => ({
              name,
              type: 'datetime',
              isNullable: true,
            })),
          ],
          indices: [
            {
              name: 'UQ_content_task_request',
              columnNames: ['userId', 'requestId'],
              isUnique: true,
            },
            {
              name: 'UQ_content_task_active_article',
              columnNames: ['activeArticleId'],
              isUnique: true,
            },
            {
              name: 'UQ_content_task_active_user',
              columnNames: ['activeUserId'],
              isUnique: true,
            },
            {
              name: 'IDX_content_task_article',
              columnNames: ['userId', 'articleId', 'id'],
            },
            { name: 'IDX_content_task_queue', columnNames: ['status', 'id'] },
          ],
        }),
      );
    }
    if (!(await runner.hasColumn('ai_feature_configs', 'activeContentKey'))) {
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
    }
    const config = await runner.getTable('ai_feature_configs');
    if (
      !config?.indices.some(
        (index) => index.name === 'UQ_ai_feature_active_content',
      )
    ) {
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

  async down(runner: QueryRunner): Promise<void> {
    const config = await runner.getTable('ai_feature_configs');
    if (
      config?.indices.some(
        (index) => index.name === 'UQ_ai_feature_active_content',
      )
    )
      await runner.dropIndex(
        'ai_feature_configs',
        'UQ_ai_feature_active_content',
      );
    if (await runner.hasColumn('ai_feature_configs', 'activeContentKey'))
      await runner.dropColumn('ai_feature_configs', 'activeContentKey');
    for (const table of ['content_generation_tasks', 'content_templates']) {
      if (await runner.hasTable(table)) await runner.dropTable(table);
    }
  }
}
