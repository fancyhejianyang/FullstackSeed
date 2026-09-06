import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnableKnowledgeRetrievalRerank1788634800000 implements MigrationInterface {
  name = 'EnableKnowledgeRetrievalRerank1788634800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` CHANGE `enableRerank` `enableRerank` tinyint NOT NULL DEFAULT 1',
    );
    await queryRunner.query(
      'UPDATE `knowledge_retrieval_configs` SET `enableRerank` = 1 WHERE `rerankAiFeatureConfigId` IS NOT NULL',
    );
    await queryRunner.query(
      "UPDATE `knowledge_retrieval_configs` AS `retrieval` JOIN (SELECT `id`, `name` FROM `ai_feature_configs` WHERE `featureType` = 'chat' AND `isEnabled` = 1 AND `deletedAt` IS NULL ORDER BY `id` DESC LIMIT 1) AS `chat` ON 1 = 1 SET `retrieval`.`enableRerank` = 1, `retrieval`.`rerankAiFeatureConfigId` = `chat`.`id`, `retrieval`.`rerankAiFeatureConfigName` = `chat`.`name` WHERE `retrieval`.`rerankAiFeatureConfigId` IS NULL AND `retrieval`.`deletedAt` IS NULL",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_retrieval_configs` CHANGE `enableRerank` `enableRerank` tinyint NOT NULL DEFAULT 0',
    );
  }
}
