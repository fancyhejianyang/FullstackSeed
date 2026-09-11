import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiWorkflows1788893200000 implements MigrationInterface {
  name = 'CreateAiWorkflows1788893200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `ai_workflows` (`id` int NOT NULL AUTO_INCREMENT, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `deletedAt` datetime(6) NULL, `name` varchar(120) NOT NULL, `workflowDefinition` text NULL, `aiInstruction` text NULL, `isEnabled` tinyint NOT NULL DEFAULT 1, `description` text NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` ADD `workflowId` int NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` ADD `workflowName` varchar(120) NULL',
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_knowledge_retrieval_configs_workflow_id` ON `knowledge_retrieval_configs` (`workflowId`)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX `IDX_knowledge_retrieval_configs_workflow_id` ON `knowledge_retrieval_configs`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` DROP COLUMN `workflowName`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` DROP COLUMN `workflowId`',
    );
    await queryRunner.query('DROP TABLE `ai_workflows`');
  }
}
