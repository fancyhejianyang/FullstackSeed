import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddContentGeneratedTitle1792386000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('content_generation_tasks', 'generatedTitle')))
      await runner.addColumn(
        'content_generation_tasks',
        new TableColumn({
          name: 'generatedTitle',
          type: 'varchar',
          length: '160',
          isNullable: true,
        }),
      );
  }

  async down(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('content_generation_tasks', 'generatedTitle')))
      return;
    const rows = (await runner.query(
      'SELECT COUNT(*) AS total FROM content_generation_tasks WHERE generatedTitle IS NOT NULL',
    )) as Array<{ total: string | number }>;
    if (Number(rows[0]?.total ?? 0) > 0)
      throw new Error(
        '已有生成标题，回退前请人工归档处理；不会自动删除生成标题',
      );
    await runner.dropColumn('content_generation_tasks', 'generatedTitle');
  }
}
