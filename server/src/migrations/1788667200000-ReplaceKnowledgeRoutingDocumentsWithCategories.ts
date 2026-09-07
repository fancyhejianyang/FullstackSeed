import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceKnowledgeRoutingDocumentsWithCategories1788667200000 implements MigrationInterface {
  name = 'ReplaceKnowledgeRoutingDocumentsWithCategories1788667200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `knowledge_routing_rule_categories` (`id` int NOT NULL AUTO_INCREMENT, `ruleId` int NOT NULL, `categoryId` int NOT NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `deletedAt` datetime NULL, INDEX `IDX_knowledge_routing_rule_category_rule` (`ruleId`), INDEX `IDX_knowledge_routing_rule_category_target` (`categoryId`), UNIQUE INDEX `UQ_knowledge_routing_rule_category` (`ruleId`, `categoryId`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'INSERT IGNORE INTO `knowledge_routing_rule_categories` (`ruleId`, `categoryId`) SELECT DISTINCT mappings.`ruleId`, COALESCE(documents.`categoryId`, bases.`categoryId`) FROM `knowledge_routing_rule_documents` mappings INNER JOIN `knowledge_base_documents` documents ON documents.`id` = mappings.`documentId` INNER JOIN `knowledge_bases` bases ON bases.`id` = documents.`knowledgeBaseId` WHERE COALESCE(documents.`categoryId`, bases.`categoryId`) IS NOT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `knowledge_routing_rule_categories`');
  }
}
