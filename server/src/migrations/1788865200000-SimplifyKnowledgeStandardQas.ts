import { MigrationInterface, QueryRunner } from 'typeorm';

export class SimplifyKnowledgeStandardQas1788865200000
  implements MigrationInterface
{
  name = 'SimplifyKnowledgeStandardQas1788865200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_standard_qas` DROP COLUMN `keywords`, DROP COLUMN `priority`, DROP COLUMN `matchThreshold`, DROP COLUMN `description`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `qaMatchScore`, DROP COLUMN `qaMatchMethod`, DROP COLUMN `qaQuestionAnalysis`',
    );
    await queryRunner.query(
      "DELETE FROM `ai_command_definitions` WHERE `commandKey` = 'question.analyze'",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_standard_qas` ADD `keywords` text NULL, ADD `priority` int NOT NULL DEFAULT 0, ADD `matchThreshold` decimal(8,4) NOT NULL DEFAULT 0.8800, ADD `description` text NULL',
    );
    await queryRunner.query(
      "ALTER TABLE `knowledge_ai_chat_messages` ADD `qaMatchScore` decimal(8,4) NULL, ADD `qaMatchMethod` varchar(40) NULL, ADD `qaQuestionAnalysis` json NULL",
    );
  }
}
