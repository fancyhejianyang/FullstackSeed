import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class MakeAgentKnowledgeOptional1792054800000 implements MigrationInterface {
  name = 'MakeAgentKnowledgeOptional1792054800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('agent_apps'))) return;

    if (await queryRunner.hasColumn('agent_apps', 'toolKeys')) {
      await queryRunner.query(`
        UPDATE \`agent_apps\`
        SET \`toolKeys\` = JSON_REMOVE(
          \`toolKeys\`,
          JSON_UNQUOTE(JSON_SEARCH(\`toolKeys\`, 'one', 'knowledge.answer'))
        )
        WHERE JSON_VALID(\`toolKeys\`)
          AND JSON_SEARCH(\`toolKeys\`, 'one', 'knowledge.answer') IS NOT NULL
      `);
    }

    if (await queryRunner.hasColumn('agent_apps', 'workflowId')) {
      await queryRunner.changeColumn(
        'agent_apps',
        'workflowId',
        new TableColumn({ name: 'workflowId', type: 'int', isNullable: true }),
      );
    }
    if (await queryRunner.hasColumn('agent_apps', 'workflowName')) {
      await queryRunner.changeColumn(
        'agent_apps',
        'workflowName',
        new TableColumn({
          name: 'workflowName',
          type: 'varchar',
          length: '120',
          isNullable: true,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('agent_apps'))) return;

    if (await queryRunner.hasColumn('agent_apps', 'toolKeys')) {
      await queryRunner.query(`
        UPDATE \`agent_apps\`
        SET \`toolKeys\` = JSON_ARRAY_APPEND(
          CASE
            WHEN JSON_VALID(\`toolKeys\`) THEN \`toolKeys\`
            ELSE JSON_ARRAY()
          END,
          '$',
          'knowledge.answer'
        )
        WHERE NOT JSON_VALID(\`toolKeys\`)
          OR JSON_SEARCH(\`toolKeys\`, 'one', 'knowledge.answer') IS NULL
      `);
    }

    if (await queryRunner.hasColumn('agent_apps', 'workflowId')) {
      await queryRunner.query(`
        UPDATE \`agent_apps\`
        SET
          \`workflowId\` = COALESCE(\`workflowId\`, 0),
          \`workflowName\` = COALESCE(NULLIF(\`workflowName\`, ''), '待重新配置')
      `);
      await queryRunner.changeColumn(
        'agent_apps',
        'workflowId',
        new TableColumn({ name: 'workflowId', type: 'int', isNullable: false }),
      );
      await queryRunner.changeColumn(
        'agent_apps',
        'workflowName',
        new TableColumn({
          name: 'workflowName',
          type: 'varchar',
          length: '120',
          isNullable: false,
        }),
      );
    }
  }
}
