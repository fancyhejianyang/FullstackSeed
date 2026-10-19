import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateContentArticles1792368000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (await runner.hasTable('content_articles')) return;
    await runner.createTable(
      new Table({
        name: 'content_articles',
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
          { name: 'title', type: 'varchar', length: '160' },
          { name: 'coverUrl', type: 'varchar', length: '2048', default: "''" },
          { name: 'idea', type: 'mediumtext' },
          { name: 'content', type: 'mediumtext' },
          { name: 'version', type: 'int', default: 1 },
        ],
        indices: [
          { name: 'IDX_content_articles_owner', columnNames: ['userId', 'id'] },
        ],
      }),
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    if (await runner.hasTable('content_articles'))
      await runner.dropTable('content_articles');
  }
}
