import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKnowledgeStandardQas1788847200000
  implements MigrationInterface
{
  name = 'CreateKnowledgeStandardQas1788847200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `knowledge_standard_qas` (`id` int NOT NULL AUTO_INCREMENT, `question` text NOT NULL, `aliases` text NULL, `keywords` text NULL, `answer` text NOT NULL, `retrievalConfigId` int NULL, `priority` int NOT NULL DEFAULT 0, `matchThreshold` decimal(8,4) NOT NULL DEFAULT 0.8800, `status` varchar(20) NOT NULL DEFAULT \'draft\', `effectiveAt` datetime NULL, `expiresAt` datetime NULL, `sourceChatMessageId` int NULL, `sourceChunkIds` text NULL, `version` int NOT NULL DEFAULT 1, `reviewedAt` datetime NULL, `hitCount` int NOT NULL DEFAULT 0, `lastHitAt` datetime NULL, `description` text NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `deletedAt` datetime NULL, INDEX `IDX_knowledge_standard_qa_retrieval` (`retrievalConfigId`), INDEX `IDX_knowledge_standard_qa_status` (`status`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `qaEntryId` int NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `qaMatchScore` decimal(8,4) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `qaMatchMethod` varchar(40) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `qaQuestionAnalysis` json NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `qaCommandIds` json NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `qaCommandIds`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `qaQuestionAnalysis`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `qaMatchMethod`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `qaMatchScore`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `qaEntryId`',
    );
    await queryRunner.query('DROP TABLE `knowledge_standard_qas`');
  }
}
