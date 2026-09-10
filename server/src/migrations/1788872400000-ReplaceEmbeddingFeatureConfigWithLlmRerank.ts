import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * “向量化”始终由 vector_configs 管理，AI 功能配置改为承载 LLM 重排。
 * 已被检索配置引用的聊天模型会复制为独立的重排配置，以断开检索到聊天配置的依赖。
 */
export class ReplaceEmbeddingFeatureConfigWithLlmRerank1788872400000
  implements MigrationInterface
{
  name = 'ReplaceEmbeddingFeatureConfigWithLlmRerank1788872400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`ai_feature_configs\`
      SET
        \`featureType\` = 'rerank',
        \`isEnabled\` = 0,
        \`enableThinking\` = 0,
        \`thinkingParameters\` = NULL,
        \`useMineru\` = 0,
        \`mineruConfigId\` = NULL,
        \`mineruConfigName\` = NULL,
        \`systemPrompt\` = NULL,
        \`temperature\` = 0,
        \`responseFormat\` = 'json',
        \`description\` = CONCAT(
          CASE
            WHEN \`description\` IS NULL OR TRIM(\`description\`) = '' THEN ''
            ELSE CONCAT(\`description\`, '\\n\\n')
          END,
          '系统迁移：原“向量化”AI 功能配置已停用并转为 LLM 重排候选。向量模型请在“向量化配置”管理；启用前请重新选择通用文本模型。'
        )
      WHERE \`featureType\` = 'embedding' AND \`deletedAt\` IS NULL
    `);

    await queryRunner.query(`
      INSERT INTO \`ai_feature_configs\` (
        \`name\`, \`featureType\`, \`providerId\`, \`providerName\`, \`model\`,
        \`enableThinking\`, \`thinkingParameters\`, \`useMineru\`,
        \`mineruConfigId\`, \`mineruConfigName\`, \`systemPrompt\`,
        \`temperature\`, \`responseFormat\`, \`isEnabled\`, \`description\`
      )
      SELECT
        CONCAT(LEFT(\`chat\`.\`name\`, 92), '（LLM 重排·迁移#', \`chat\`.\`id\`, '）'),
        'rerank', \`chat\`.\`providerId\`, \`chat\`.\`providerName\`, \`chat\`.\`model\`,
        0, NULL, 0, NULL, NULL, NULL,
        0, 'json', \`chat\`.\`isEnabled\`,
        '系统迁移：由检索配置原先引用的聊天配置拆分而来，用于 LLM 重排。固定使用温度 0 和内置 JSON 评分提示词。'
      FROM \`ai_feature_configs\` AS \`chat\`
      INNER JOIN (
        SELECT DISTINCT \`rerankAiFeatureConfigId\`
        FROM \`knowledge_retrieval_configs\`
        WHERE \`enableRerank\` = 1
          AND \`rerankAiFeatureConfigId\` IS NOT NULL
          AND \`deletedAt\` IS NULL
      ) AS \`used\` ON \`used\`.\`rerankAiFeatureConfigId\` = \`chat\`.\`id\`
      WHERE \`chat\`.\`featureType\` = 'chat' AND \`chat\`.\`deletedAt\` IS NULL
    `);

    await queryRunner.query(`
      UPDATE \`knowledge_retrieval_configs\` AS \`retrieval\`
      INNER JOIN \`ai_feature_configs\` AS \`chat\`
        ON \`chat\`.\`id\` = \`retrieval\`.\`rerankAiFeatureConfigId\`
      INNER JOIN \`ai_feature_configs\` AS \`rerank\`
        ON \`rerank\`.\`featureType\` = 'rerank'
        AND \`rerank\`.\`name\` = CONCAT(LEFT(\`chat\`.\`name\`, 92), '（LLM 重排·迁移#', \`chat\`.\`id\`, '）')
        AND \`rerank\`.\`deletedAt\` IS NULL
      SET
        \`retrieval\`.\`rerankAiFeatureConfigId\` = \`rerank\`.\`id\`,
        \`retrieval\`.\`rerankAiFeatureConfigName\` = \`rerank\`.\`name\`
      WHERE \`chat\`.\`featureType\` = 'chat' AND \`retrieval\`.\`deletedAt\` IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`knowledge_retrieval_configs\` AS \`retrieval\`
      INNER JOIN \`ai_feature_configs\` AS \`rerank\`
        ON \`rerank\`.\`id\` = \`retrieval\`.\`rerankAiFeatureConfigId\`
      SET
        \`retrieval\`.\`enableRerank\` = 0,
        \`retrieval\`.\`rerankAiFeatureConfigId\` = NULL,
        \`retrieval\`.\`rerankAiFeatureConfigName\` = NULL
      WHERE \`rerank\`.\`description\` = '系统迁移：由检索配置原先引用的聊天配置拆分而来，用于 LLM 重排。固定使用温度 0 和内置 JSON 评分提示词。'
    `);
    await queryRunner.query(`
      DELETE FROM \`ai_feature_configs\`
      WHERE \`description\` = '系统迁移：由检索配置原先引用的聊天配置拆分而来，用于 LLM 重排。固定使用温度 0 和内置 JSON 评分提示词。'
    `);
  }
}
