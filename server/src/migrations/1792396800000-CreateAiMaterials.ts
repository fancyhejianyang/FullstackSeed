import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateAiMaterials1792396800000 implements MigrationInterface {
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

    if (!(await runner.hasTable('managed_files'))) {
      await runner.createTable(
        new Table({
          name: 'managed_files',
          columns: [
            ...base(),
            { name: 'ownerId', type: 'int' },
            { name: 'scope', type: 'varchar', length: '40' },
            { name: 'environment', type: 'varchar', length: '30' },
            { name: 'storageProvider', type: 'varchar', length: '24' },
            { name: 'storageIdentity', type: 'varchar', length: '64' },
            { name: 'objectKey', type: 'varchar', length: '700' },
            { name: 'publicUrl', type: 'varchar', length: '2048' },
            { name: 'fileName', type: 'varchar', length: '120' },
            { name: 'mimeType', type: 'varchar', length: '120' },
            { name: 'size', type: 'bigint', default: 0 },
            {
              name: 'status',
              type: 'varchar',
              length: '24',
              default: "'staged'",
            },
            { name: 'deleteAfter', type: 'datetime', isNullable: true },
            { name: 'retryAt', type: 'datetime', isNullable: true },
            {
              name: 'errorMessage',
              type: 'varchar',
              length: '500',
              isNullable: true,
            },
          ],
          indices: [
            {
              name: 'IDX_managed_file_cleanup',
              columnNames: ['scope', 'status', 'deleteAfter'],
            },
            {
              name: 'IDX_managed_file_owner',
              columnNames: ['ownerId', 'scope', 'id'],
            },
          ],
        }),
      );
    }

    if (!(await runner.hasTable('managed_file_references'))) {
      await runner.createTable(
        new Table({
          name: 'managed_file_references',
          columns: [
            ...base(),
            { name: 'fileId', type: 'int' },
            { name: 'ownerId', type: 'int' },
            { name: 'businessType', type: 'varchar', length: '40' },
            { name: 'businessId', type: 'int' },
            { name: 'role', type: 'varchar', length: '40' },
          ],
          indices: [
            {
              name: 'UQ_managed_file_business_ref',
              columnNames: ['businessType', 'businessId', 'role'],
              isUnique: true,
            },
            { name: 'IDX_managed_file_ref_file', columnNames: ['fileId'] },
          ],
        }),
      );
    }

    if (!(await runner.hasTable('ai_materials'))) {
      await runner.createTable(
        new Table({
          name: 'ai_materials',
          columns: [
            ...base(),
            { name: 'userId', type: 'int' },
            { name: 'prompt', type: 'text' },
            {
              name: 'styleKey',
              type: 'varchar',
              length: '40',
              default: "'original'",
            },
            { name: 'customStyle', type: 'text', isNullable: true },
            { name: 'aiConfigId', type: 'int' },
            { name: 'currentFileId', type: 'int', isNullable: true },
            {
              name: 'currentImageUrl',
              type: 'varchar',
              length: '2048',
              isNullable: true,
            },
            { name: 'version', type: 'int', default: 1 },
            { name: 'generationRevision', type: 'int', default: 0 },
            {
              name: 'generationStatus',
              type: 'varchar',
              length: '24',
              default: "'idle'",
            },
            {
              name: 'generationError',
              type: 'varchar',
              length: '500',
              isNullable: true,
            },
          ],
          indices: [
            {
              name: 'IDX_ai_material_owner',
              columnNames: ['userId', 'id'],
            },
          ],
        }),
      );
    }

    if (!(await runner.hasTable('material_generation_tasks'))) {
      await runner.createTable(
        new Table({
          name: 'material_generation_tasks',
          columns: [
            ...base(),
            { name: 'userId', type: 'int' },
            { name: 'materialId', type: 'int' },
            { name: 'materialVersion', type: 'int' },
            { name: 'requestId', type: 'varchar', length: '36' },
            {
              name: 'status',
              type: 'varchar',
              length: '24',
              default: "'pending'",
            },
            { name: 'activeMaterialId', type: 'int', isNullable: true },
            { name: 'activeUserId', type: 'int', isNullable: true },
            { name: 'snapshot', type: 'json' },
            { name: 'resultFileId', type: 'int', isNullable: true },
            {
              name: 'workerId',
              type: 'varchar',
              length: '36',
              isNullable: true,
            },
            { name: 'leaseExpiresAt', type: 'datetime', isNullable: true },
            { name: 'startedAt', type: 'datetime', isNullable: true },
            { name: 'finishedAt', type: 'datetime', isNullable: true },
            {
              name: 'errorMessage',
              type: 'varchar',
              length: '500',
              isNullable: true,
            },
          ],
          indices: [
            {
              name: 'UQ_material_task_request',
              columnNames: ['userId', 'requestId'],
              isUnique: true,
            },
            {
              name: 'UQ_material_task_active_material',
              columnNames: ['activeMaterialId'],
              isUnique: true,
            },
            {
              name: 'UQ_material_task_active_user',
              columnNames: ['activeUserId'],
              isUnique: true,
            },
            {
              name: 'IDX_material_task_material',
              columnNames: ['userId', 'materialId', 'id'],
            },
            { name: 'IDX_material_task_queue', columnNames: ['status', 'id'] },
          ],
        }),
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    const tableNames = [
      'material_generation_tasks',
      'ai_materials',
      'managed_file_references',
      'managed_files',
    ];
    for (const tableName of tableNames) {
      if (!(await runner.hasTable(tableName))) continue;
      const rows = (await runner.query(
        `SELECT COUNT(*) AS total FROM \`${tableName}\``,
      )) as Array<{ total: string | number }>;
      if (Number(rows[0]?.total ?? 0) > 0)
        throw new Error(`${tableName} 已有数据，请先归档后再回退迁移`);
    }
    for (const tableName of tableNames) {
      if (!(await runner.hasTable(tableName))) continue;
      await runner.dropTable(tableName);
    }
  }
}
