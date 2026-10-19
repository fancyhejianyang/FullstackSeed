import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class RememberContentGenerationSettings1792382400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const initialize = !(await runner.hasColumn(
      'content_articles',
      'aiConfigId',
    ));
    for (const name of ['aiConfigId', 'templateId']) {
      if (!(await runner.hasColumn('content_articles', name)))
        await runner.addColumn(
          'content_articles',
          new TableColumn({ name, type: 'int', isNullable: true }),
        );
    }
    // 只在首次新增列时回填本人最近一次选择，不覆盖后来手动清空的偏好。
    if (initialize && (await runner.hasTable('content_generation_tasks'))) {
      await runner.query(`
        UPDATE content_articles article
        JOIN (
          SELECT articleId, userId, MAX(id) AS id
          FROM content_generation_tasks WHERE deletedAt IS NULL
          GROUP BY articleId, userId
        ) recent ON recent.articleId = article.id AND recent.userId = article.userId
        JOIN content_generation_tasks task ON task.id = recent.id
        SET article.aiConfigId = CAST(JSON_UNQUOTE(JSON_EXTRACT(task.snapshot, '$.config.id')) AS UNSIGNED),
            article.templateId = CASE
              WHEN JSON_UNQUOTE(JSON_EXTRACT(task.snapshot, '$.template.id')) REGEXP '^[1-9][0-9]*$'
              THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(task.snapshot, '$.template.id')) AS UNSIGNED)
              ELSE NULL END
        WHERE article.deletedAt IS NULL AND article.aiConfigId IS NULL
          AND JSON_UNQUOTE(JSON_EXTRACT(task.snapshot, '$.config.id')) REGEXP '^[1-9][0-9]*$'
      `);
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    const columns: string[] = [];
    for (const name of ['aiConfigId', 'templateId'])
      if (await runner.hasColumn('content_articles', name)) columns.push(name);
    if (!columns.length) return;
    const rows = (await runner.query(
      `SELECT COUNT(*) AS total FROM content_articles WHERE ${columns.map((name) => `${name} IS NOT NULL`).join(' OR ')}`,
    )) as Array<{ total: number | string }>;
    if (Number(rows[0]?.total ?? 0) > 0)
      throw new Error(
        '已有文章生成设置，请先人工归档；不会自动删除已保存的配置或模板选择',
      );
    for (const name of columns)
      await runner.dropColumn('content_articles', name);
  }
}
