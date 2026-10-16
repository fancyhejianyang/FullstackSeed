import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAgentInstructionMarkdown1792137600000 implements MigrationInterface {
  name = 'AddAgentInstructionMarkdown1792137600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('agent_apps'))) return;

    if (!(await queryRunner.hasColumn('agent_apps', 'instructionMarkdown'))) {
      await queryRunner.addColumn(
        'agent_apps',
        new TableColumn({
          name: 'instructionMarkdown',
          type: 'text',
          isNullable: true,
        }),
      );
    }

    await queryRunner.query(`
      UPDATE \`agent_apps\`
      SET \`instructionMarkdown\` = CONCAT(
        '# 工作目标\\n\\n',
        COALESCE(NULLIF(TRIM(\`responsibility\`), ''), '请补充 Agent 的工作目标。'),
        '\\n\\n## 处理规则\\n\\n',
        '- 仅使用已授权的业务工具。\\n',
        '- 涉及写入时先生成待确认内容，确认后再提交。\\n',
        '- 只有收到真实工具回执后才能说明操作成功。'
      )
      WHERE \`instructionMarkdown\` IS NULL
         OR TRIM(\`instructionMarkdown\`) = ''
    `);

    await queryRunner.changeColumn(
      'agent_apps',
      'instructionMarkdown',
      new TableColumn({
        name: 'instructionMarkdown',
        type: 'text',
        isNullable: false,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('agent_apps'))) return;
    if (await queryRunner.hasColumn('agent_apps', 'instructionMarkdown')) {
      await queryRunner.dropColumn('agent_apps', 'instructionMarkdown');
    }
  }
}
