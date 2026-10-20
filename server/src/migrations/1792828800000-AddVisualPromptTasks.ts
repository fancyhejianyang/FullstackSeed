import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class AddVisualPromptTasks1792828800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (await runner.hasTable('visual_prompt_tasks')) return;
    await runner.createTable(
      new Table({
        name: 'visual_prompt_tasks',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'userId', type: 'int' },
          { name: 'taskType', type: 'varchar', length: '20' },
          { name: 'templateId', type: 'int' },
          { name: 'workflowId', type: 'int', isNullable: true },
          { name: 'requestId', type: 'varchar', length: '80' },
          {
            name: 'activeKey',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'pending'",
          },
          {
            name: 'stage',
            type: 'varchar',
            length: '120',
            default: "'等待执行'",
          },
          { name: 'snapshot', type: 'json' },
          { name: 'result', type: 'json', isNullable: true },
          {
            name: 'errorMessage',
            type: 'varchar',
            length: '400',
            isNullable: true,
          },
          { name: 'workerId', type: 'varchar', length: '36', isNullable: true },
          { name: 'leaseExpiresAt', type: 'datetime', isNullable: true },
          { name: 'startedAt', type: 'datetime', isNullable: true },
          { name: 'finishedAt', type: 'datetime', isNullable: true },
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
        ],
        indices: [
          {
            name: 'UQ_visual_prompt_task_request',
            columnNames: ['userId', 'requestId'],
            isUnique: true,
          },
          {
            name: 'UQ_visual_prompt_task_active',
            columnNames: ['activeKey'],
            isUnique: true,
          },
          {
            name: 'IDX_visual_prompt_task_queue',
            columnNames: ['status', 'id'],
          },
        ],
      }),
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    if (await runner.hasTable('visual_prompt_tasks')) {
      await runner.dropTable('visual_prompt_tasks');
    }
  }
}
