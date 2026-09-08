import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiFeatureConfigThinking1788757200000
  implements MigrationInterface
{
  name = 'AddAiFeatureConfigThinking1788757200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `ai_feature_configs` ADD `enableThinking` tinyint NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'ALTER TABLE `ai_feature_configs` ADD `thinkingParameters` json NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `ai_feature_configs` DROP COLUMN `thinkingParameters`',
    );
    await queryRunner.query(
      'ALTER TABLE `ai_feature_configs` DROP COLUMN `enableThinking`',
    );
  }
}
