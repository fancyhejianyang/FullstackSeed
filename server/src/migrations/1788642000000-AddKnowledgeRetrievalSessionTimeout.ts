import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKnowledgeRetrievalSessionTimeout1788642000000 implements MigrationInterface {
  name = 'AddKnowledgeRetrievalSessionTimeout1788642000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` ADD `sessionContextTimeoutMinutes` int NOT NULL DEFAULT 15',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_sessions` ADD `lastRetrievalAt` datetime NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_sessions` DROP COLUMN `lastRetrievalAt`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` DROP COLUMN `sessionContextTimeoutMinutes`',
    );
  }
}
