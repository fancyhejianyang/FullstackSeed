import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiWorkflowSteps1788886000000 implements MigrationInterface {
  name = 'AddAiWorkflowSteps1788886000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` ADD `enableStandardQa` tinyint NOT NULL DEFAULT 1',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` ADD `enableColloquial` tinyint NOT NULL DEFAULT 1',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` ADD `enableKnowledgeRetrieval` tinyint NOT NULL DEFAULT 1',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` ADD `enableBusinessCommands` tinyint NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      "UPDATE `menus` SET `name` = 'AI 工作流配置' WHERE `path` = '/chat-management/retrieval-configs' AND `name` = '知识库检索配置'",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` DROP COLUMN `enableBusinessCommands`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` DROP COLUMN `enableKnowledgeRetrieval`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` DROP COLUMN `enableColloquial`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` DROP COLUMN `enableStandardQa`',
    );
  }
}
