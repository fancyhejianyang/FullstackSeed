import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class RemoveDraftLifecycle1793001600000 implements MigrationInterface {
  private async dropColumnIfPresent(
    runner: QueryRunner,
    table: string,
    column: string,
  ) {
    if (await runner.hasColumn(table, column)) {
      await runner.dropColumn(table, column);
    }
  }

  async up(runner: QueryRunner): Promise<void> {
    if (await runner.hasTable('dashboard_configs')) {
      const hadLatestCopy = await runner.hasColumn(
        'dashboard_configs',
        'draft',
      );
      const hadPublishedCopy = await runner.hasColumn(
        'dashboard_configs',
        'published',
      );
      if (!(await runner.hasColumn('dashboard_configs', 'widgets'))) {
        await runner.addColumn(
          'dashboard_configs',
          new TableColumn({
            name: 'widgets',
            type: 'text',
            isNullable: true,
          }),
        );
        const source = hadLatestCopy
          ? '`draft`'
          : hadPublishedCopy
            ? '`published`'
            : "'[]'";
        await runner.query(
          `UPDATE \`dashboard_configs\` SET \`widgets\` = COALESCE(${source}, '[]')`,
        );
        await runner.changeColumn(
          'dashboard_configs',
          'widgets',
          new TableColumn({ name: 'widgets', type: 'text', isNullable: false }),
        );
      }
      for (const column of [
        'publishedVersion',
        'draft',
        'published',
        'previous',
        'publishedAt',
      ]) {
        await this.dropColumnIfPresent(runner, 'dashboard_configs', column);
      }
    }

    if (
      (await runner.hasTable('comfy_workflows')) &&
      (await runner.hasColumn('comfy_workflows', 'isPublished'))
    ) {
      await runner.dropColumn('comfy_workflows', 'isPublished');
    }

    if (await runner.hasTable('knowledge_standard_qas')) {
      if (!(await runner.hasColumn('knowledge_standard_qas', 'isActive'))) {
        await runner.addColumn(
          'knowledge_standard_qas',
          new TableColumn({
            name: 'isActive',
            type: 'tinyint',
            width: 1,
            default: 1,
          }),
        );
        if (await runner.hasColumn('knowledge_standard_qas', 'status')) {
          await runner.query(
            "UPDATE `knowledge_standard_qas` SET `isActive` = IF(`status` = 'published', 1, 0)",
          );
        }
      }
      const qaTable = await runner.getTable('knowledge_standard_qas');
      if (
        qaTable?.indices.some(
          (index) => index.name === 'IDX_knowledge_standard_qa_status',
        )
      ) {
        await runner.dropIndex(
          'knowledge_standard_qas',
          'IDX_knowledge_standard_qa_status',
        );
      }
      if (
        !qaTable?.indices.some(
          (index) => index.name === 'IDX_knowledge_standard_qas_isActive',
        )
      ) {
        await runner.createIndex(
          'knowledge_standard_qas',
          new TableIndex({
            name: 'IDX_knowledge_standard_qas_isActive',
            columnNames: ['isActive'],
          }),
        );
      }
      await this.dropColumnIfPresent(
        runner,
        'knowledge_standard_qas',
        'status',
      );
      await this.dropColumnIfPresent(
        runner,
        'knowledge_standard_qas',
        'reviewedAt',
      );
    }

    if (await runner.hasTable('demo')) {
      if (!(await runner.hasColumn('demo', 'isActive'))) {
        await runner.addColumn(
          'demo',
          new TableColumn({
            name: 'isActive',
            type: 'tinyint',
            width: 1,
            default: 1,
          }),
        );
        if (await runner.hasColumn('demo', 'status')) {
          await runner.query(
            "UPDATE `demo` SET `isActive` = IF(`status` = 'published', 1, 0)",
          );
        }
      }
      await this.dropColumnIfPresent(runner, 'demo', 'status');
      await this.dropColumnIfPresent(runner, 'demo', 'publishedAt');
    }

    if (await runner.hasTable('knowledge_base_documents')) {
      await runner.query(
        "UPDATE `knowledge_base_documents` SET `status` = 'empty' WHERE `status` = 'draft'",
      );
      await runner.query(
        "ALTER TABLE `knowledge_base_documents` MODIFY `status` varchar(30) NOT NULL DEFAULT 'empty'",
      );
    }

    if (await runner.hasTable('agent_drafts')) {
      await runner.renameTable('agent_drafts', 'agent_pending_actions');
    }
    if (await runner.hasTable('agent_pending_actions')) {
      const actionTable = await runner.getTable('agent_pending_actions');
      if (
        actionTable?.indices.some(
          (index) => index.name === 'IDX_agent_drafts_session_status',
        )
      ) {
        await runner.dropIndex(
          'agent_pending_actions',
          'IDX_agent_drafts_session_status',
        );
      }
      if (
        !actionTable?.indices.some(
          (index) => index.name === 'IDX_agent_pending_actions_session_status',
        )
      ) {
        await runner.createIndex(
          'agent_pending_actions',
          new TableIndex({
            name: 'IDX_agent_pending_actions_session_status',
            columnNames: ['sessionId', 'status'],
          }),
        );
      }
    }
    if (
      (await runner.hasTable('agent_executions')) &&
      (await runner.hasColumn('agent_executions', 'draftId')) &&
      !(await runner.hasColumn('agent_executions', 'pendingActionId'))
    ) {
      await runner.renameColumn(
        'agent_executions',
        'draftId',
        'pendingActionId',
      );
    }
    if (await runner.hasTable('agent_messages')) {
      await runner.query(
        "UPDATE `agent_messages` SET `messageType` = 'pending_action' WHERE `messageType` = 'draft'",
      );
      await runner.query(
        'UPDATE `agent_messages` SET `structuredData` = REPLACE(REPLACE(`structuredData`, \'"draftId":\', \'"pendingActionId":\'), \'"draftVersion":\', \'"pendingActionVersion":\') WHERE `structuredData` IS NOT NULL',
      );
    }
    if (await runner.hasTable('agent_executions')) {
      for (const column of ['parameterSummary', 'result']) {
        if (await runner.hasColumn('agent_executions', column)) {
          await runner.query(
            `UPDATE \`agent_executions\` SET \`${column}\` = REPLACE(REPLACE(\`${column}\`, '"draftId":', '"pendingActionId":'), '"draftVersion":', '"pendingActionVersion":') WHERE \`${column}\` IS NOT NULL`,
          );
        }
      }
    }

    if (await runner.hasTable('menus')) {
      await runner.query(
        "UPDATE `menus` SET `isActive` = 0 WHERE `path` IN ('/collaboration-center', '/collaboration-center/approvals')",
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    if (await runner.hasTable('menus')) {
      await runner.query(
        "UPDATE `menus` SET `isActive` = 1 WHERE `path` IN ('/collaboration-center', '/collaboration-center/approvals')",
      );
    }
    if (await runner.hasTable('agent_messages')) {
      await runner.query(
        "UPDATE `agent_messages` SET `messageType` = 'draft' WHERE `messageType` = 'pending_action'",
      );
      await runner.query(
        'UPDATE `agent_messages` SET `structuredData` = REPLACE(REPLACE(`structuredData`, \'"pendingActionId":\', \'"draftId":\'), \'"pendingActionVersion":\', \'"draftVersion":\') WHERE `structuredData` IS NOT NULL',
      );
    }
    if (await runner.hasTable('agent_executions')) {
      for (const column of ['parameterSummary', 'result']) {
        if (await runner.hasColumn('agent_executions', column)) {
          await runner.query(
            `UPDATE \`agent_executions\` SET \`${column}\` = REPLACE(REPLACE(\`${column}\`, '"pendingActionId":', '"draftId":'), '"pendingActionVersion":', '"draftVersion":') WHERE \`${column}\` IS NOT NULL`,
          );
        }
      }
    }
    if (
      (await runner.hasTable('agent_executions')) &&
      (await runner.hasColumn('agent_executions', 'pendingActionId')) &&
      !(await runner.hasColumn('agent_executions', 'draftId'))
    ) {
      await runner.renameColumn(
        'agent_executions',
        'pendingActionId',
        'draftId',
      );
    }
    if (await runner.hasTable('agent_pending_actions')) {
      await runner.renameTable('agent_pending_actions', 'agent_drafts');
    }
    if (await runner.hasTable('agent_drafts')) {
      const actionTable = await runner.getTable('agent_drafts');
      if (
        actionTable?.indices.some(
          (index) => index.name === 'IDX_agent_pending_actions_session_status',
        )
      ) {
        await runner.dropIndex(
          'agent_drafts',
          'IDX_agent_pending_actions_session_status',
        );
      }
      if (
        !actionTable?.indices.some(
          (index) => index.name === 'IDX_agent_drafts_session_status',
        )
      ) {
        await runner.createIndex(
          'agent_drafts',
          new TableIndex({
            name: 'IDX_agent_drafts_session_status',
            columnNames: ['sessionId', 'status'],
          }),
        );
      }
    }

    if (await runner.hasTable('knowledge_base_documents')) {
      await runner.query(
        "UPDATE `knowledge_base_documents` SET `status` = 'draft' WHERE `status` = 'empty'",
      );
      await runner.query(
        "ALTER TABLE `knowledge_base_documents` MODIFY `status` varchar(30) NOT NULL DEFAULT 'draft'",
      );
    }

    if (await runner.hasTable('demo')) {
      if (!(await runner.hasColumn('demo', 'status'))) {
        await runner.addColumn(
          'demo',
          new TableColumn({
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'draft'",
          }),
        );
        await runner.query(
          "UPDATE `demo` SET `status` = IF(`isActive` = 1, 'published', 'disabled')",
        );
      }
      if (!(await runner.hasColumn('demo', 'publishedAt'))) {
        await runner.addColumn(
          'demo',
          new TableColumn({
            name: 'publishedAt',
            type: 'datetime',
            isNullable: true,
          }),
        );
      }
      await this.dropColumnIfPresent(runner, 'demo', 'isActive');
    }

    if (await runner.hasTable('knowledge_standard_qas')) {
      if (!(await runner.hasColumn('knowledge_standard_qas', 'status'))) {
        await runner.addColumn(
          'knowledge_standard_qas',
          new TableColumn({
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'draft'",
          }),
        );
        await runner.query(
          "UPDATE `knowledge_standard_qas` SET `status` = IF(`isActive` = 1, 'published', 'disabled')",
        );
      }
      if (!(await runner.hasColumn('knowledge_standard_qas', 'reviewedAt'))) {
        await runner.addColumn(
          'knowledge_standard_qas',
          new TableColumn({
            name: 'reviewedAt',
            type: 'datetime',
            isNullable: true,
          }),
        );
      }
      const qaTable = await runner.getTable('knowledge_standard_qas');
      if (
        qaTable?.indices.some(
          (index) => index.name === 'IDX_knowledge_standard_qas_isActive',
        )
      ) {
        await runner.dropIndex(
          'knowledge_standard_qas',
          'IDX_knowledge_standard_qas_isActive',
        );
      }
      await this.dropColumnIfPresent(
        runner,
        'knowledge_standard_qas',
        'isActive',
      );
      const restoredQaTable = await runner.getTable('knowledge_standard_qas');
      if (
        !restoredQaTable?.indices.some(
          (index) => index.name === 'IDX_knowledge_standard_qa_status',
        )
      ) {
        await runner.createIndex(
          'knowledge_standard_qas',
          new TableIndex({
            name: 'IDX_knowledge_standard_qa_status',
            columnNames: ['status'],
          }),
        );
      }
    }

    if (
      (await runner.hasTable('comfy_workflows')) &&
      !(await runner.hasColumn('comfy_workflows', 'isPublished'))
    ) {
      await runner.addColumn(
        'comfy_workflows',
        new TableColumn({
          name: 'isPublished',
          type: 'tinyint',
          width: 1,
          default: 1,
        }),
      );
    }

    if (
      (await runner.hasTable('dashboard_configs')) &&
      (await runner.hasColumn('dashboard_configs', 'widgets'))
    ) {
      for (const column of [
        new TableColumn({ name: 'publishedVersion', type: 'int', default: 0 }),
        new TableColumn({ name: 'draft', type: 'text', isNullable: true }),
        new TableColumn({ name: 'published', type: 'text', isNullable: true }),
        new TableColumn({ name: 'previous', type: 'text', isNullable: true }),
        new TableColumn({
          name: 'publishedAt',
          type: 'datetime',
          isNullable: true,
        }),
      ]) {
        if (!(await runner.hasColumn('dashboard_configs', column.name))) {
          await runner.addColumn('dashboard_configs', column);
        }
      }
      await runner.query(
        'UPDATE `dashboard_configs` SET `draft` = `widgets`, `published` = `widgets`, `publishedVersion` = `revision`',
      );
      await runner.dropColumn('dashboard_configs', 'widgets');
    }
  }
}
