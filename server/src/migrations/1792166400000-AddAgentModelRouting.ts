import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAgentModelRouting1792166400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (
      (await queryRunner.hasTable('agent_apps')) &&
      !(await queryRunner.hasColumn('agent_apps', 'modelRouting'))
    ) {
      await queryRunner.addColumn(
        'agent_apps',
        new TableColumn({
          name: 'modelRouting',
          type: 'text',
          isNullable: true,
        }),
      );
    }
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    if (
      (await queryRunner.hasTable('agent_apps')) &&
      (await queryRunner.hasColumn('agent_apps', 'modelRouting'))
    ) {
      await queryRunner.dropColumn('agent_apps', 'modelRouting');
    }
  }
}
