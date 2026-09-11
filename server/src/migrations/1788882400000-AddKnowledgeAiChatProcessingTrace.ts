import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKnowledgeAiChatProcessingTrace1788882400000
  implements MigrationInterface
{
  name = 'AddKnowledgeAiChatProcessingTrace1788882400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `retrievalConfigId` int NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `processingTrace` text NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `processingTrace`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `retrievalConfigId`',
    );
  }
}
