import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveKnowledgeBaseMatchingFields1788896800000
  implements MigrationInterface
{
  name = 'RemoveKnowledgeBaseMatchingFields1788896800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_bases` DROP COLUMN `hitKeywords`, DROP COLUMN `colloquialDescription`, DROP COLUMN `matchPriority`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_base_documents` DROP COLUMN `hitKeywords`, DROP COLUMN `colloquialDescription`, DROP COLUMN `matchPriority`',
    );
    await queryRunner.query(
      "UPDATE `knowledge_base_chunks` SET `vectorStatus` = 'pending', `vectorError` = NULL, `vectorizedAt` = NULL, `contentHash` = NULL WHERE `deletedAt` IS NULL",
    );
    await queryRunner.query(
      "UPDATE `knowledge_bases` SET `processStage` = 'chunked', `indexStatus` = 'pending', `lastProcessMessage` = '检索辅助字段已移除，请重新建立索引' WHERE `deletedAt` IS NULL",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_base_documents` ADD `matchPriority` int NOT NULL DEFAULT 1',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_base_documents` ADD `colloquialDescription` text NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_base_documents` ADD `hitKeywords` text NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_bases` ADD `matchPriority` int NOT NULL DEFAULT 1',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_bases` ADD `colloquialDescription` text NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_bases` ADD `hitKeywords` text NULL',
    );
  }
}
