import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

const columns = [
  new TableColumn({ name: 'configSnapshot', type: 'text', isNullable: true }),
  new TableColumn({
    name: 'configVersion',
    type: 'varchar',
    length: '64',
    isNullable: true,
  }),
  new TableColumn({
    name: 'statusReason',
    type: 'varchar',
    length: '64',
    isNullable: true,
  }),
  new TableColumn({
    name: 'failureStage',
    type: 'varchar',
    length: '64',
    isNullable: true,
  }),
  new TableColumn({ name: 'promptTokens', type: 'int', isNullable: true }),
  new TableColumn({ name: 'completionTokens', type: 'int', isNullable: true }),
  new TableColumn({ name: 'totalTokens', type: 'int', isNullable: true }),
  new TableColumn({
    name: 'modelCallDurationMs',
    type: 'int',
    isNullable: true,
  }),
  new TableColumn({ name: 'heartbeatAt', type: 'datetime', isNullable: true }),
  new TableColumn({
    name: 'leaseExpiresAt',
    type: 'datetime',
    isNullable: true,
  }),
];

export class AddAgentExecutionReliability1792278000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('agent_executions'))) return;
    for (const column of columns) {
      if (!(await queryRunner.hasColumn('agent_executions', column.name))) {
        await queryRunner.addColumn('agent_executions', column);
      }
    }
    const table = await queryRunner.getTable('agent_executions');
    if (
      table &&
      !table.indices.some(
        (index) => index.name === 'IDX_agent_executions_status_lease',
      )
    ) {
      await queryRunner.createIndex(
        'agent_executions',
        new TableIndex({
          name: 'IDX_agent_executions_status_lease',
          columnNames: ['status', 'leaseExpiresAt'],
        }),
      );
    }
    await queryRunner.query(`
      UPDATE agent_executions
      SET heartbeatAt = COALESCE(updatedAt, startedAt, createdAt),
          leaseExpiresAt = DATE_ADD(COALESCE(startedAt, createdAt), INTERVAL 10 MINUTE)
      WHERE status IN ('queued', 'running', 'submitting', 'verifying')
        AND leaseExpiresAt IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('agent_executions'))) return;
    const table = await queryRunner.getTable('agent_executions');
    if (
      table?.indices.some(
        (index) => index.name === 'IDX_agent_executions_status_lease',
      )
    ) {
      await queryRunner.dropIndex(
        'agent_executions',
        'IDX_agent_executions_status_lease',
      );
    }
    for (const column of [...columns].reverse()) {
      if (await queryRunner.hasColumn('agent_executions', column.name)) {
        await queryRunner.dropColumn('agent_executions', column.name);
      }
    }
  }
}
