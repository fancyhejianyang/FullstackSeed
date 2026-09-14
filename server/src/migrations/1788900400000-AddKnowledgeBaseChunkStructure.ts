import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKnowledgeBaseChunkStructure1788900400000 implements MigrationInterface {
  name = 'AddKnowledgeBaseChunkStructure1788900400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_base_chunks` ADD `sectionPath` varchar(500) NULL',
    );
    await queryRunner.query(
      "ALTER TABLE `knowledge_base_chunks` ADD `blockType` varchar(30) NOT NULL DEFAULT 'paragraph'",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_base_chunks` DROP COLUMN `blockType`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_base_chunks` DROP COLUMN `sectionPath`',
    );
  }
}
