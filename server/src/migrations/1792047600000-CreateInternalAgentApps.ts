import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class CreateInternalAgentApps1792047600000 implements MigrationInterface {
  name = 'CreateInternalAgentApps1792047600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('product_skus', 'agentOperationKey'))) {
      await queryRunner.addColumn(
        'product_skus',
        new TableColumn({
          name: 'agentOperationKey',
          type: 'varchar',
          length: '120',
          isNullable: true,
        }),
      );
    }
    const skuTable = await queryRunner.getTable('product_skus');
    if (
      !skuTable?.indices.some(
        (index) => index.name === 'UQ_product_skus_agent_operation',
      )
    ) {
      await queryRunner.createIndex(
        'product_skus',
        new TableIndex({
          name: 'UQ_product_skus_agent_operation',
          columnNames: ['agentOperationKey'],
          isUnique: true,
        }),
      );
    }

    await this.createTableIfMissing(
      queryRunner,
      new Table({
        name: 'agent_apps',
        columns: [
          ...this.baseColumns(),
          { name: 'name', type: 'varchar', length: '120' },
          { name: 'responsibility', type: 'text' },
          { name: 'aiFeatureConfigId', type: 'int' },
          { name: 'aiFeatureConfigName', type: 'varchar', length: '120' },
          { name: 'workflowId', type: 'int' },
          { name: 'workflowName', type: 'varchar', length: '120' },
          { name: 'toolKeys', type: 'text' },
          {
            name: 'accessScope',
            type: 'varchar',
            length: '20',
            default: "'all'",
          },
          { name: 'allowedUserIds', type: 'text', isNullable: true },
          { name: 'isEnabled', type: 'tinyint', default: '1' },
          { name: 'writeEnabled', type: 'tinyint', default: '0' },
          { name: 'maxToolCalls', type: 'int', default: '5' },
          { name: 'timeoutSeconds', type: 'int', default: '60' },
          { name: 'maxConcurrentRuns', type: 'int', default: '1' },
        ],
        indices: [{ name: 'IDX_agent_apps_name', columnNames: ['name'] }],
      }),
    );
    await this.createTableIfMissing(
      queryRunner,
      new Table({
        name: 'agent_sessions',
        columns: [
          ...this.baseColumns(),
          { name: 'userId', type: 'int' },
          { name: 'userName', type: 'varchar', length: '120' },
          { name: 'agentAppId', type: 'int' },
          { name: 'agentAppName', type: 'varchar', length: '120' },
          { name: 'title', type: 'varchar', length: '200' },
          {
            name: 'status',
            type: 'varchar',
            length: '24',
            default: "'active'",
          },
          { name: 'messageCount', type: 'int', default: '0' },
          { name: 'knowledgeSessionId', type: 'int', isNullable: true },
          { name: 'lastMessage', type: 'text', isNullable: true },
          {
            name: 'lastExecutionStatus',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
        ],
        indices: [
          {
            name: 'IDX_agent_sessions_owner_app',
            columnNames: ['userId', 'agentAppId', 'id'],
          },
        ],
      }),
    );
    await this.createTableIfMissing(
      queryRunner,
      new Table({
        name: 'agent_messages',
        columns: [
          ...this.baseColumns(),
          { name: 'sessionId', type: 'int' },
          { name: 'userId', type: 'int' },
          { name: 'role', type: 'varchar', length: '16' },
          {
            name: 'messageType',
            type: 'varchar',
            length: '32',
            default: "'text'",
          },
          { name: 'content', type: 'longtext' },
          { name: 'structuredData', type: 'text', isNullable: true },
          { name: 'executionId', type: 'int', isNullable: true },
          {
            name: 'clientMessageId',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
        ],
        indices: [
          {
            name: 'IDX_agent_messages_session',
            columnNames: ['sessionId', 'id'],
          },
          {
            name: 'UQ_agent_messages_client',
            columnNames: ['sessionId', 'clientMessageId'],
            isUnique: true,
          },
        ],
      }),
    );
    await this.createTableIfMissing(
      queryRunner,
      new Table({
        name: 'agent_drafts',
        columns: [
          ...this.baseColumns(),
          { name: 'sessionId', type: 'int' },
          { name: 'userId', type: 'int' },
          { name: 'agentAppId', type: 'int' },
          { name: 'toolKey', type: 'varchar', length: '64' },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            default: "'collecting'",
          },
          { name: 'version', type: 'int', default: '1' },
          { name: 'data', type: 'text' },
          { name: 'missingFields', type: 'text' },
          { name: 'validationErrors', type: 'text' },
          { name: 'submittedRecordId', type: 'int', isNullable: true },
          { name: 'lastExecutionId', type: 'int', isNullable: true },
        ],
        indices: [
          {
            name: 'IDX_agent_drafts_session_status',
            columnNames: ['sessionId', 'status'],
          },
        ],
      }),
    );
    await this.createTableIfMissing(
      queryRunner,
      new Table({
        name: 'agent_executions',
        columns: [
          ...this.baseColumns(),
          { name: 'requestId', type: 'varchar', length: '120' },
          { name: 'sessionId', type: 'int' },
          { name: 'userId', type: 'int' },
          { name: 'agentAppId', type: 'int' },
          { name: 'messageId', type: 'int', isNullable: true },
          { name: 'draftId', type: 'int', isNullable: true },
          { name: 'toolKey', type: 'varchar', length: '64' },
          {
            name: 'status',
            type: 'varchar',
            length: '32',
            default: "'queued'",
          },
          { name: 'parameterSummary', type: 'text', isNullable: true },
          { name: 'result', type: 'text', isNullable: true },
          { name: 'errorMessage', type: 'text', isNullable: true },
          { name: 'toolCallCount', type: 'int', default: '0' },
          { name: 'startedAt', type: 'datetime', isNullable: true },
          { name: 'finishedAt', type: 'datetime', isNullable: true },
        ],
        indices: [
          {
            name: 'UQ_agent_executions_request',
            columnNames: ['requestId'],
            isUnique: true,
          },
          {
            name: 'IDX_agent_executions_owner_status',
            columnNames: ['userId', 'agentAppId', 'status'],
          },
        ],
      }),
    );
    if (await queryRunner.hasTable('menus')) {
      await queryRunner.query(
        "UPDATE `menus` SET `name` = 'Agent 调试' WHERE `path` = '/chat-management/ai-chat'",
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('menus')) {
      await queryRunner.query(
        "UPDATE `menus` SET `name` = 'AI 问答测试' WHERE `path` = '/chat-management/ai-chat'",
      );
    }
    for (const table of [
      'agent_executions',
      'agent_drafts',
      'agent_messages',
      'agent_sessions',
      'agent_apps',
    ]) {
      if (await queryRunner.hasTable(table))
        await queryRunner.dropTable(table, true);
    }
    const skuTable = await queryRunner.getTable('product_skus');
    if (
      skuTable?.indices.some(
        (index) => index.name === 'UQ_product_skus_agent_operation',
      )
    ) {
      await queryRunner.dropIndex(
        'product_skus',
        'UQ_product_skus_agent_operation',
      );
    }
    if (await queryRunner.hasColumn('product_skus', 'agentOperationKey')) {
      await queryRunner.dropColumn('product_skus', 'agentOperationKey');
    }
  }

  private async createTableIfMissing(queryRunner: QueryRunner, table: Table) {
    if (!(await queryRunner.hasTable(table.name))) {
      await queryRunner.createTable(table);
    }
  }

  private baseColumns() {
    return [
      {
        name: 'id',
        type: 'int',
        isPrimary: true,
        isGenerated: true,
        generationStrategy: 'increment' as const,
      },
      { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
      {
        name: 'updatedAt',
        type: 'timestamp',
        default: 'CURRENT_TIMESTAMP',
        onUpdate: 'CURRENT_TIMESTAMP',
      },
      { name: 'deletedAt', type: 'timestamp', isNullable: true },
    ];
  }
}
