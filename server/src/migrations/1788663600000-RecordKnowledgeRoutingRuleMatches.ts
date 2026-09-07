import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecordKnowledgeRoutingRuleMatches1788663600000 implements MigrationInterface {
  name = 'RecordKnowledgeRoutingRuleMatches1788663600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `routingRuleMatches` text NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `routingRuleMatches`',
    );
  }
}
