import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceAiFeatureConfigRulesWithTemperature1788861600000
  implements MigrationInterface
{
  name = 'ReplaceAiFeatureConfigRulesWithTemperature1788861600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 旧“规则”本质属于提示词；先合并，避免升级后丢失已有业务约束。
    await queryRunner.query(`
      UPDATE \`ai_feature_configs\`
      SET \`systemPrompt\` = CASE
        WHEN \`rules\` IS NULL OR TRIM(\`rules\`) = '' THEN \`systemPrompt\`
        WHEN \`systemPrompt\` IS NULL OR TRIM(\`systemPrompt\`) = '' THEN \`rules\`
        ELSE CONCAT(\`systemPrompt\`, '\\n\\n', \`rules\`)
      END
    `);
    await queryRunner.query(
      'ALTER TABLE `ai_feature_configs` ADD `temperature` double NOT NULL DEFAULT 0.2',
    );
    await queryRunner.query(
      'ALTER TABLE `ai_feature_configs` DROP COLUMN `rules`',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `ai_feature_configs` ADD `rules` text NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `ai_feature_configs` DROP COLUMN `temperature`',
    );
  }
}
