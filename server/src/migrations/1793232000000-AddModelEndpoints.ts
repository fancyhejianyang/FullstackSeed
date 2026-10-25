import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class AddModelEndpoints1793232000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (await runner.hasTable('model_endpoints')) return;
    await runner.createTable(
      new Table({
        name: 'model_endpoints',
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
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
          { name: 'deletedAt', type: 'timestamp', isNullable: true },
          { name: 'platformType', type: 'varchar', length: '32' },
          { name: 'modelCode', type: 'varchar', length: '120' },
          { name: 'modelName', type: 'varchar', length: '120' },
          { name: 'functionType', type: 'varchar', length: '32' },
          { name: 'protocol', type: 'varchar', length: '40' },
          { name: 'apiPath', type: 'varchar', length: '500' },
          {
            name: 'taskApiPath',
            type: 'varchar',
            length: '500',
            default: "''",
          },
          {
            name: 'executionMode',
            type: 'varchar',
            length: '8',
            default: "'sync'",
          },
          { name: 'isActive', type: 'tinyint', default: 1 },
          {
            name: 'routeKey',
            type: 'varchar',
            length: '200',
            isNullable: true,
            isUnique: true,
          },
        ],
      }),
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasTable('model_endpoints'))) return;
    const rows = (await runner.query(
      'SELECT COUNT(*) AS total FROM `model_endpoints`',
    )) as Array<{ total: string | number }>;
    if (Number(rows[0]?.total ?? 0))
      throw new Error('已有模型接口配置，请归档数据后再回退迁移');
    await runner.dropTable('model_endpoints');
  }
}
