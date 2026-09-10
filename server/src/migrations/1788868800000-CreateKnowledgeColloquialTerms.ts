import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKnowledgeColloquialTerms1788868800000
  implements MigrationInterface
{
  name = 'CreateKnowledgeColloquialTerms1788868800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `knowledge_colloquial_terms` (`id` int NOT NULL AUTO_INCREMENT, `term` varchar(160) NOT NULL, `replacement` varchar(500) NOT NULL, `semanticType` varchar(32) NOT NULL DEFAULT \'custom\', `semanticDefinition` text NOT NULL, `answerUnit` varchar(160) NULL, `retrievalConfigId` int NULL, `matchMode` varchar(20) NOT NULL DEFAULT \'contains\', `excludePhrases` text NULL, `isEnabled` tinyint NOT NULL DEFAULT 1, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `deletedAt` datetime NULL, INDEX `IDX_knowledge_colloquial_terms_retrieval` (`retrievalConfigId`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `colloquialTermMatches` text NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `colloquialTermMatches`',
    );
    await queryRunner.query('DROP TABLE `knowledge_colloquial_terms`');
  }
}
