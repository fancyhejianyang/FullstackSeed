import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class LinkComfyWorkflowVisualPrompt1792742400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (
      !(await runner.hasColumn('comfy_workflows', 'visualPromptTemplateId'))
    ) {
      await runner.addColumn(
        'comfy_workflows',
        new TableColumn({
          name: 'visualPromptTemplateId',
          type: 'int',
          isNullable: true,
        }),
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    if (await runner.hasColumn('comfy_workflows', 'visualPromptTemplateId')) {
      await runner.dropColumn('comfy_workflows', 'visualPromptTemplateId');
    }
  }
}
