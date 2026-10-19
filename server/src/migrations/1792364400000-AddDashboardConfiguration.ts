import { MigrationInterface, QueryRunner, Table } from 'typeorm';
export class AddDashboardConfiguration1792364400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (await runner.hasTable('dashboard_configs')) return;
    await runner.createTable(
      new Table({
        name: 'dashboard_configs',
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
          { name: 'key', type: 'varchar', length: '40', isUnique: true },
          { name: 'revision', type: 'int', default: 0 },
          { name: 'publishedVersion', type: 'int', default: 0 },
          { name: 'draft', type: 'text' },
          { name: 'published', type: 'text' },
          { name: 'previous', type: 'text', isNullable: true },
          { name: 'updatedBy', type: 'int', isNullable: true },
          { name: 'publishedAt', type: 'datetime', isNullable: true },
        ],
      }),
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    if (await runner.hasTable('dashboard_configs'))
      await runner.dropTable('dashboard_configs');
  }
}
