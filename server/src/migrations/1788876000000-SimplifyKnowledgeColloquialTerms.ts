import { MigrationInterface, QueryRunner } from 'typeorm';

export class SimplifyKnowledgeColloquialTerms1788876000000
  implements MigrationInterface
{
  name = 'SimplifyKnowledgeColloquialTerms1788876000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`knowledge_colloquial_terms\`
      SET \`semanticDefinition\` = CASE
        WHEN \`answerUnit\` IS NULL OR TRIM(\`answerUnit\`) = '' THEN \`semanticDefinition\`
        WHEN JSON_VALID(\`semanticDefinition\`) AND JSON_TYPE(\`semanticDefinition\`) = 'OBJECT'
          THEN JSON_SET(\`semanticDefinition\`, '$.legacyRecommendedUnit', \`answerUnit\`)
        ELSE CONCAT(\`semanticDefinition\`, '\\n推荐表达单位：', \`answerUnit\`)
      END
      WHERE \`deletedAt\` IS NULL
    `);
    await queryRunner.query(
      'ALTER TABLE `knowledge_colloquial_terms` DROP COLUMN `answerUnit`',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_colloquial_terms` DROP COLUMN `matchMode`',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_colloquial_terms` ADD `answerUnit` varchar(160) NULL',
    );
    await queryRunner.query(
      "ALTER TABLE `knowledge_colloquial_terms` ADD `matchMode` varchar(20) NOT NULL DEFAULT 'contains'",
    );
  }
}
