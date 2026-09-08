import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKnowledgeAiChatTokenUsage1788753600000 implements MigrationInterface {
  name = 'AddKnowledgeAiChatTokenUsage1788753600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `promptTokens` int NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `completionTokens` int NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `totalTokens` int NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `totalTokens`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `completionTokens`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `promptTokens`',
    );
  }
}
