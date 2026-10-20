import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateComfyUiIntegration1792483200000 implements MigrationInterface {
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

    if (!(await runner.hasTable('comfy_connections'))) {
      await runner.createTable(
        new Table({
          name: 'comfy_connections',
          columns: [
            ...base(),
            { name: 'name', type: 'varchar', length: '100' },
            { name: 'baseUrl', type: 'varchar', length: '500' },
            {
              name: 'authType',
              type: 'varchar',
              length: '20',
              default: "'none'",
            },
            {
              name: 'username',
              type: 'varchar',
              length: '120',
              isNullable: true,
            },
            { name: 'secret', type: 'text', isNullable: true },
            { name: 'requestTimeoutMs', type: 'int', default: 15000 },
            { name: 'taskTimeoutSec', type: 'int', default: 1800 },
            { name: 'maxConcurrency', type: 'int', default: 1 },
            { name: 'isEnabled', type: 'tinyint', width: 1, default: 1 },
            { name: 'isDefault', type: 'tinyint', width: 1, default: 0 },
            {
              name: 'lastTestStatus',
              type: 'varchar',
              length: '20',
              default: "'untested'",
            },
            { name: 'lastTestedAt', type: 'datetime', isNullable: true },
            {
              name: 'lastTestMessage',
              type: 'varchar',
              length: '500',
              isNullable: true,
            },
            { name: 'capabilitySnapshot', type: 'text', isNullable: true },
            {
              name: 'description',
              type: 'varchar',
              length: '500',
              isNullable: true,
            },
          ],
          indices: [
            {
              name: 'UQ_comfy_connection_name',
              columnNames: ['name'],
              isUnique: true,
            },
          ],
        }),
      );
    }

    if (!(await runner.hasTable('comfy_workflows'))) {
      await runner.createTable(
        new Table({
          name: 'comfy_workflows',
          columns: [
            ...base(),
            { name: 'name', type: 'varchar', length: '120' },
            { name: 'connectionId', type: 'int' },
            {
              name: 'outputType',
              type: 'varchar',
              length: '20',
              default: "'image'",
            },
            {
              name: 'description',
              type: 'varchar',
              length: '500',
              isNullable: true,
            },
            { name: 'apiWorkflow', type: 'longtext' },
            { name: 'inputBindings', type: 'text' },
            { name: 'outputNodeIds', type: 'text', isNullable: true },
            { name: 'dependencyNotes', type: 'text', isNullable: true },
            { name: 'version', type: 'int', default: 1 },
            { name: 'isPublished', type: 'tinyint', width: 1, default: 0 },
            { name: 'isEnabled', type: 'tinyint', width: 1, default: 1 },
          ],
          indices: [
            {
              name: 'IDX_comfy_workflow_connection',
              columnNames: ['connectionId', 'isEnabled'],
            },
          ],
        }),
      );
    }

    if (!(await runner.hasTable('comfy_workflow_versions'))) {
      await runner.createTable(
        new Table({
          name: 'comfy_workflow_versions',
          columns: [
            ...base(),
            { name: 'workflowId', type: 'int' },
            { name: 'version', type: 'int' },
            { name: 'connectionId', type: 'int' },
            { name: 'name', type: 'varchar', length: '120' },
            { name: 'outputType', type: 'varchar', length: '20' },
            { name: 'apiWorkflow', type: 'longtext' },
            { name: 'inputBindings', type: 'text' },
            { name: 'outputNodeIds', type: 'text', isNullable: true },
          ],
          indices: [
            {
              name: 'UQ_comfy_workflow_version',
              columnNames: ['workflowId', 'version'],
              isUnique: true,
            },
          ],
        }),
      );
    }

    if (!(await runner.hasTable('comfy_materials'))) {
      await runner.createTable(
        new Table({
          name: 'comfy_materials',
          columns: [
            ...base(),
            { name: 'userId', type: 'int' },
            { name: 'name', type: 'varchar', length: '160' },
            { name: 'sourceType', type: 'varchar', length: '20' },
            { name: 'mediaType', type: 'varchar', length: '20' },
            { name: 'fileId', type: 'int', isNullable: true },
            {
              name: 'fileUrl',
              type: 'varchar',
              length: '2048',
              isNullable: true,
            },
            {
              name: 'mimeType',
              type: 'varchar',
              length: '120',
              isNullable: true,
            },
            { name: 'size', type: 'bigint', default: 0 },
            { name: 'sourceTaskId', type: 'int', isNullable: true },
            { name: 'isFavorite', type: 'tinyint', width: 1, default: 0 },
          ],
          indices: [
            { name: 'IDX_comfy_material_owner', columnNames: ['userId', 'id'] },
          ],
        }),
      );
    }

    if (!(await runner.hasTable('comfy_tasks'))) {
      await runner.createTable(
        new Table({
          name: 'comfy_tasks',
          columns: [
            ...base(),
            { name: 'userId', type: 'int' },
            { name: 'workflowId', type: 'int' },
            { name: 'workflowVersionId', type: 'int' },
            { name: 'connectionId', type: 'int' },
            { name: 'requestId', type: 'varchar', length: '80' },
            { name: 'outputType', type: 'varchar', length: '20' },
            {
              name: 'status',
              type: 'varchar',
              length: '24',
              default: "'pending'",
            },
            {
              name: 'stage',
              type: 'varchar',
              length: '120',
              default: "'等待执行'",
            },
            { name: 'progress', type: 'int', isNullable: true },
            { name: 'parameterSnapshot', type: 'text' },
            { name: 'workflowSnapshot', type: 'longtext' },
            { name: 'bindingSnapshot', type: 'text' },
            {
              name: 'promptId',
              type: 'varchar',
              length: '120',
              isNullable: true,
            },
            {
              name: 'errorMessage',
              type: 'varchar',
              length: '700',
              isNullable: true,
            },
            { name: 'startedAt', type: 'datetime', isNullable: true },
            { name: 'finishedAt', type: 'datetime', isNullable: true },
          ],
          indices: [
            {
              name: 'UQ_comfy_task_request',
              columnNames: ['userId', 'requestId'],
              isUnique: true,
            },
            { name: 'IDX_comfy_task_dispatch', columnNames: ['status', 'id'] },
          ],
        }),
      );
    }

    if (!(await runner.hasTable('comfy_task_outputs'))) {
      await runner.createTable(
        new Table({
          name: 'comfy_task_outputs',
          columns: [
            ...base(),
            { name: 'taskId', type: 'int' },
            { name: 'materialId', type: 'int' },
            { name: 'fileId', type: 'int' },
            { name: 'fileUrl', type: 'varchar', length: '2048' },
            { name: 'fileName', type: 'varchar', length: '120' },
            { name: 'mimeType', type: 'varchar', length: '120' },
            { name: 'size', type: 'bigint', default: 0 },
            {
              name: 'nodeId',
              type: 'varchar',
              length: '100',
              isNullable: true,
            },
          ],
          indices: [
            {
              name: 'IDX_comfy_task_output_task',
              columnNames: ['taskId', 'id'],
            },
          ],
        }),
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    for (const table of [
      'comfy_task_outputs',
      'comfy_tasks',
      'comfy_materials',
      'comfy_workflow_versions',
      'comfy_workflows',
      'comfy_connections',
    ]) {
      if (await runner.hasTable(table)) await runner.dropTable(table);
    }
  }
}
