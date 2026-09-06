import { MigrationInterface, QueryRunner } from 'typeorm';

export class ImproveKnowledgeRetrievalContext1788627600000 implements MigrationInterface {
  name = 'ImproveKnowledgeRetrievalContext1788627600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` CHANGE `topK` `topK` int NOT NULL DEFAULT 6',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` CHANGE `minScore` `minScore` decimal(8,4) NOT NULL DEFAULT 0.3500',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_sessions` ADD `activeKnowledgeBaseId` int NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_sessions` ADD `lastRetrievalQuery` text NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `retrievalQuery` text NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `hitKnowledgeBaseIds` text NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `hitChunkIds` text NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `retrievalHits` text NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `rerankApplied` tinyint NOT NULL DEFAULT 0',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `rerankApplied`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `retrievalHits`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `hitChunkIds`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `hitKnowledgeBaseIds`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `retrievalQuery`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_sessions` DROP COLUMN `lastRetrievalQuery`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_sessions` DROP COLUMN `activeKnowledgeBaseId`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` CHANGE `minScore` `minScore` decimal(8,4) NOT NULL DEFAULT 0.0000',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` CHANGE `topK` `topK` int NOT NULL DEFAULT 10',
    );
  }
}
