import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class AddVisualPromptTemplates1792656000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasTable('visual_prompt_templates'))) {
      await runner.createTable(
        new Table({
          name: 'visual_prompt_templates',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
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
            {
              name: 'deletedAt',
              type: 'timestamp',
              precision: 6,
              isNullable: true,
            },
            { name: 'userId', type: 'int' },
            { name: 'name', type: 'varchar', length: '120' },
            {
              name: 'mediaType',
              type: 'varchar',
              length: '12',
              default: "'image'",
            },
            {
              name: 'targetModel',
              type: 'varchar',
              length: '120',
              isNullable: true,
            },
            {
              name: 'sourcePlatform',
              type: 'varchar',
              length: '120',
              isNullable: true,
            },
            { name: 'aiConfigId', type: 'int' },
            { name: 'aiConfigName', type: 'varchar', length: '120' },
            { name: 'sourcePrompt', type: 'longtext' },
            {
              name: 'sourceNegativePrompt',
              type: 'longtext',
              isNullable: true,
            },
            { name: 'positiveTemplate', type: 'longtext', isNullable: true },
            { name: 'negativeTemplate', type: 'longtext', isNullable: true },
            { name: 'styleSummary', type: 'text', isNullable: true },
            { name: 'modelRules', type: 'text', isNullable: true },
            { name: 'variables', type: 'text', isNullable: true },
            { name: 'version', type: 'int', default: 1 },
            { name: 'isEnabled', type: 'tinyint', width: 1, default: 1 },
            { name: 'extractedAt', type: 'datetime', isNullable: true },
          ],
          indices: [
            {
              name: 'IDX_visual_prompt_template_owner',
              columnNames: ['userId', 'mediaType', 'isEnabled'],
            },
          ],
        }),
      );
    }
    for (const table of ['comfy_workflows', 'comfy_workflow_versions']) {
      if (!(await runner.hasColumn(table, 'targetModel'))) {
        await runner.addColumn(
          table,
          new TableColumn({
            name: 'targetModel',
            type: 'varchar',
            length: '120',
            isNullable: true,
          }),
        );
      }
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    for (const table of ['comfy_workflow_versions', 'comfy_workflows']) {
      if (await runner.hasColumn(table, 'targetModel')) {
        await runner.dropColumn(table, 'targetModel');
      }
    }
    if (await runner.hasTable('visual_prompt_templates')) {
      await runner.dropTable('visual_prompt_templates');
    }
  }
}
