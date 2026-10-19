import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddContentEditorNotes1792378800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('content_generation_tasks', 'editorNotes')))
      await runner.addColumn(
        'content_generation_tasks',
        new TableColumn({
          name: 'editorNotes',
          type: 'json',
          isNullable: true,
        }),
      );
  }

  async down(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('content_generation_tasks', 'editorNotes')))
      return;
    const rows = (await runner.query(
      "SELECT COUNT(*) AS total FROM content_generation_tasks WHERE editorNotes IS NOT NULL OR status = 'needs_input'",
    )) as Array<{ total: string | number }>;
    if (Number(rows[0]?.total ?? 0) > 0)
      throw new Error(
        '已有编辑提示或待补充任务，回退前请人工归档处理；不会自动删除提示或更改任务状态',
      );
    await runner.dropColumn('content_generation_tasks', 'editorNotes');
  }
}
