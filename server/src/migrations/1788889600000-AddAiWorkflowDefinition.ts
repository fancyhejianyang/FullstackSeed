import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiWorkflowDefinition1788889600000 implements MigrationInterface {
  name = 'AddAiWorkflowDefinition1788889600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` ADD `workflowDefinition` text NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` DROP COLUMN `workflowDefinition`',
    );
  }
}
