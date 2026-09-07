import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKnowledgeRoutingRules1788656400000 implements MigrationInterface {
  name = 'CreateKnowledgeRoutingRules1788656400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "CREATE TABLE `knowledge_routing_rules` (`id` int NOT NULL AUTO_INCREMENT, `term` varchar(160) NOT NULL, `ruleType` varchar(20) NOT NULL DEFAULT 'generic', `matchMode` varchar(20) NOT NULL DEFAULT 'contains', `weight` decimal(8,4) NOT NULL DEFAULT -0.8000, `retrievalConfigId` int NOT NULL, `isEnabled` tinyint NOT NULL DEFAULT 1, `description` text NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `deletedAt` datetime NULL, INDEX `IDX_knowledge_routing_rules_retrieval_config` (`retrievalConfigId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
    );
    await queryRunner.query(
      'CREATE TABLE `knowledge_routing_rule_knowledge_bases` (`id` int NOT NULL AUTO_INCREMENT, `ruleId` int NOT NULL, `knowledgeBaseId` int NOT NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `deletedAt` datetime NULL, INDEX `IDX_knowledge_routing_rule_knowledge_base_rule` (`ruleId`), INDEX `IDX_knowledge_routing_rule_knowledge_base_target` (`knowledgeBaseId`), UNIQUE INDEX `UQ_knowledge_routing_rule_knowledge_base` (`ruleId`, `knowledgeBaseId`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'CREATE TABLE `knowledge_routing_rule_documents` (`id` int NOT NULL AUTO_INCREMENT, `ruleId` int NOT NULL, `documentId` int NOT NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `deletedAt` datetime NULL, INDEX `IDX_knowledge_routing_rule_document_rule` (`ruleId`), INDEX `IDX_knowledge_routing_rule_document_target` (`documentId`), UNIQUE INDEX `UQ_knowledge_routing_rule_document` (`ruleId`, `documentId`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `knowledge_routing_rule_documents`');
    await queryRunner.query(
      'DROP TABLE `knowledge_routing_rule_knowledge_bases`',
    );
    await queryRunner.query('DROP TABLE `knowledge_routing_rules`');
  }
}
