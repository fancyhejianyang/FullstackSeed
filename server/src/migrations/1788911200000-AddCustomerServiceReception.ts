import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

/** 增量迁移：不重写旧问答数据，旧会话不会自动取得新的访客访问凭证。 */
export class AddCustomerServiceReception1788911200000 implements MigrationInterface {
  name = 'AddCustomerServiceReception1788911200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('external_apps', 'maxConcurrentChats'))) {
      await queryRunner.addColumn('external_apps', new TableColumn({
        name: 'maxConcurrentChats', type: 'int', isNullable: true,
      }));
    }
    const sessionColumns = [
      new TableColumn({ name: 'externalAppId', type: 'int', isNullable: true }),
      new TableColumn({ name: 'sessionTokenHash', type: 'varchar', length: '64', isNullable: true }),
      new TableColumn({ name: 'serviceStatus', type: 'varchar', length: '24', default: "'ai'" }),
      new TableColumn({ name: 'assignedAgentId', type: 'int', isNullable: true }),
      new TableColumn({ name: 'assignedAgentName', type: 'varchar', length: '120', isNullable: true }),
      new TableColumn({ name: 'serviceVersion', type: 'int', default: '0' }),
    ];
    for (const column of sessionColumns) {
      if (!(await queryRunner.hasColumn('knowledge_ai_chat_sessions', column.name))) {
        await queryRunner.addColumn('knowledge_ai_chat_sessions', column);
      }
    }
    for (const [name, column] of [
      ['IDX_chat_sessions_external_app', 'externalAppId'],
      ['IDX_chat_sessions_service_status', 'serviceStatus'],
    ]) {
      const table = await queryRunner.getTable('knowledge_ai_chat_sessions');
      if (!table?.indices.some((index) => index.name === name)) {
        await queryRunner.createIndex('knowledge_ai_chat_sessions', new TableIndex({ name, columnNames: [column] }));
      }
    }
    if (!(await queryRunner.hasTable('customer_chat_messages'))) {
      await queryRunner.createTable(new Table({
        name: 'customer_chat_messages',
        columns: [
          ...this.baseColumns(),
          { name: 'sessionId', type: 'int' },
          { name: 'role', type: 'varchar', length: '16' },
          { name: 'content', type: 'longtext' },
          { name: 'agentId', type: 'int', isNullable: true },
          { name: 'agentName', type: 'varchar', length: '120', isNullable: true },
          { name: 'clientMessageId', type: 'varchar', length: '64', isNullable: true },
          { name: 'taskId', type: 'int', isNullable: true },
        ],
        indices: [
          { name: 'UQ_customer_chat_messages_request', columnNames: ['sessionId', 'clientMessageId'], isUnique: true },
          { name: 'IDX_customer_chat_messages_session', columnNames: ['sessionId', 'id'] },
        ],
      }));
    }
    if (!(await queryRunner.hasTable('customer_chat_tasks'))) {
      await queryRunner.createTable(new Table({
        name: 'customer_chat_tasks',
        columns: [
          ...this.baseColumns(),
          { name: 'externalAppId', type: 'int' },
          { name: 'sessionId', type: 'int' },
          { name: 'visitorMessageId', type: 'int' },
          { name: 'question', type: 'text' },
          { name: 'status', type: 'varchar', length: '24', default: "'queued'" },
          { name: 'sessionVersion', type: 'int', default: '0' },
          { name: 'answer', type: 'longtext', isNullable: true },
          { name: 'aiMessageId', type: 'int', isNullable: true },
          { name: 'failureReason', type: 'text', isNullable: true },
          { name: 'cancelReason', type: 'varchar', length: '255', isNullable: true },
          { name: 'startedAt', type: 'datetime', isNullable: true },
          { name: 'finishedAt', type: 'datetime', isNullable: true },
        ],
        indices: [
          { name: 'IDX_customer_chat_tasks_app_status', columnNames: ['externalAppId', 'status', 'id'] },
          { name: 'IDX_customer_chat_tasks_session_status', columnNames: ['sessionId', 'status'] },
        ],
      }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚会删除本功能新增的接待/排队消息，应先导出这些表；原 AI 问答表保留。
    await queryRunner.dropTable('customer_chat_tasks', true);
    await queryRunner.dropTable('customer_chat_messages', true);
    for (const name of ['IDX_chat_sessions_external_app', 'IDX_chat_sessions_service_status']) {
      const table = await queryRunner.getTable('knowledge_ai_chat_sessions');
      if (table?.indices.some((index) => index.name === name)) {
        await queryRunner.dropIndex('knowledge_ai_chat_sessions', name);
      }
    }
    for (const name of ['serviceVersion', 'assignedAgentName', 'assignedAgentId', 'serviceStatus', 'sessionTokenHash', 'externalAppId']) {
      if (await queryRunner.hasColumn('knowledge_ai_chat_sessions', name)) {
        await queryRunner.dropColumn('knowledge_ai_chat_sessions', name);
      }
    }
    if (await queryRunner.hasColumn('external_apps', 'maxConcurrentChats')) {
      await queryRunner.dropColumn('external_apps', 'maxConcurrentChats');
    }
  }

  private baseColumns() {
    return [
      { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' as const },
      { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
      { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
      { name: 'deletedAt', type: 'timestamp', isNullable: true },
    ];
  }
}
