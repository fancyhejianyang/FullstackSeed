import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddContentCover1792393200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    for (const column of [
      new TableColumn({
        name: 'coverStatus',
        type: 'varchar',
        length: '20',
        isNullable: true,
      }),
      new TableColumn({ name: 'coverData', type: 'json', isNullable: true }),
    ]) {
      if (!(await runner.hasColumn('content_generation_tasks', column.name)))
        await runner.addColumn('content_generation_tasks', column);
    }
    const table = await runner.getTable('content_generation_tasks');
    if (
      !table?.indices.some((index) => index.name === 'IDX_content_cover_queue')
    )
      await runner.createIndex(
        'content_generation_tasks',
        new TableIndex({
          name: 'IDX_content_cover_queue',
          columnNames: ['coverStatus', 'id'],
        }),
      );
    // 不回填历史任务，不触发任何已有文章的生图调用。
  }
  async down(runner: QueryRunner): Promise<void> {
    const columns: string[] = [];
    for (const name of ['coverStatus', 'coverData']) {
      if (!(await runner.hasColumn('content_generation_tasks', name))) continue;
      columns.push(name);
      const rows = (await runner.query(
        `SELECT COUNT(*) AS total FROM content_generation_tasks WHERE \`${name}\` IS NOT NULL`,
      )) as Array<{ total: string | number }>;
      if (Number(rows[0]?.total ?? 0) > 0)
        throw new Error(
          '已有封面任务数据，请人工归档后回退；不会自动删除候选封面。',
        );
    }
    const table = await runner.getTable('content_generation_tasks');
    if (
      table?.indices.some((index) => index.name === 'IDX_content_cover_queue')
    )
      await runner.dropIndex(
        'content_generation_tasks',
        'IDX_content_cover_queue',
      );
    for (const name of columns)
      await runner.dropColumn('content_generation_tasks', name);
  }
}
