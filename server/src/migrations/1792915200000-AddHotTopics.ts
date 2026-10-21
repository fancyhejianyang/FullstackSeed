import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';
import type { TableColumnOptions } from 'typeorm/schema-builder/options/TableColumnOptions';
import type { TableIndexOptions } from 'typeorm/schema-builder/options/TableIndexOptions';

const col = (
  name: string,
  type: string,
  extra: Partial<TableColumnOptions> = {},
): TableColumnOptions => ({ name, type, ...extra });
const str = (
  name: string,
  length: number,
  extra: Partial<TableColumnOptions> = {},
) => col(name, 'varchar', { length: String(length), ...extra });
const nullable = { isNullable: true };
const empty = { default: "''" };
const base: TableColumnOptions[] = [
  col('id', 'int', {
    isPrimary: true,
    isGenerated: true,
    generationStrategy: 'increment',
  }),
  col('createdAt', 'timestamp', {
    precision: 6,
    default: 'CURRENT_TIMESTAMP(6)',
  }),
  col('updatedAt', 'timestamp', {
    precision: 6,
    default: 'CURRENT_TIMESTAMP(6)',
    onUpdate: 'CURRENT_TIMESTAMP(6)',
  }),
  col('deletedAt', 'timestamp', { precision: 6, ...nullable }),
];
const definitions: {
  name: string;
  columns: TableColumnOptions[];
  indices: TableIndexOptions[];
}[] = [
  {
    name: 'hot_topic_sources',
    columns: [
      str('name', 120),
      str('kind', 30),
      str('accessMode', 20),
      str('url', 2048),
      str('accountName', 120, empty),
      str('accountId', 160, empty),
      col('apiToken', 'text', nullable),
      col('isEnabled', 'tinyint', { default: 0 }),
      str('description', 2000, empty),
    ],
    indices: [],
  },
  {
    name: 'hot_topic_preferences',
    columns: [
      col('userId', 'int'),
      str('mode', 20, { default: "'aiSearch'" }),
      col('aiConfigId', 'int', nullable),
      col('sourceIds', 'text'),
      col('interests', 'text'),
      col('exclusions', 'text'),
      str('audience', 1000, empty),
      str('writingStyle', 1000, empty),
      col('lookbackHours', 'int', { default: 24 }),
      col('maxResults', 'int', { default: 10 }),
      col('scheduleEnabled', 'tinyint', { default: 0 }),
      str('scheduleTime', 5, { default: "'08:30'" }),
      str('timeZone', 40, { default: "'Asia/Shanghai'" }),
      col('nextRunAt', 'datetime', nullable),
    ],
    indices: [{ columnNames: ['userId'], isUnique: true }],
  },
  {
    name: 'hot_topic_runs',
    columns: [
      col('userId', 'int'),
      str('requestId', 100),
      col('activeUserId', 'int', nullable),
      str('action', 20),
      str('trigger', 20, { default: "'manual'" }),
      str('status', 20, { default: "'pending'" }),
      str('stage', 30, { default: "'queued'" }),
      col('preferences', 'text'),
      col('sources', 'text', nullable),
      col('searchExecuted', 'tinyint', { default: 0 }),
      col('candidateCount', 'int', { default: 0 }),
      col('topicCount', 'int', { default: 0 }),
      col('totalTokens', 'int', nullable),
      str('message', 2000, empty),
      col('errorMessage', 'text', nullable),
      str('workerId', 50, nullable),
      col('leaseExpiresAt', 'datetime', nullable),
      col('startedAt', 'datetime', nullable),
      col('finishedAt', 'datetime', nullable),
    ],
    indices: [
      { columnNames: ['userId'] },
      { columnNames: ['userId', 'requestId'], isUnique: true },
      { columnNames: ['activeUserId'], isUnique: true },
      { columnNames: ['status'] },
    ],
  },
  {
    name: 'hot_topics',
    columns: [
      col('userId', 'int'),
      str('urlHash', 64),
      str('title', 500),
      col('summary', 'text'),
      str('url', 2048),
      str('sourceName', 120),
      col('sourceId', 'int', nullable),
      str('platform', 40),
      str('accountName', 120, nullable),
      str('accountId', 160, nullable),
      col('accountMatched', 'tinyint', { default: 0 }),
      col('rank', 'int', nullable),
      col('heat', 'double', nullable),
      str('publishedAt', 40, nullable),
      str('fetchedAt', 40),
      str('acquisition', 20),
      col('candidates', 'json'),
      str('recommendationLevel', 20, { default: "'unreviewed'" }),
      col('reason', 'text'),
      col('suggestedAngles', 'text'),
      str('materialCompleteness', 20, { default: "'titleOnly'" }),
      str('decision', 20, { default: "'new'" }),
      col('articleId', 'int', nullable),
      col('articleTaskId', 'int', nullable),
      str('selectionRequestId', 36, nullable),
    ],
    indices: [
      { columnNames: ['userId'] },
      { columnNames: ['userId', 'urlHash'], isUnique: true },
      { columnNames: ['fetchedAt'] },
    ],
  },
];
const additions = [
  {
    table: 'ai_feature_configs',
    column: str('webSearchMode', 32, { default: "'disabled'" }),
  },
  { table: 'content_articles', column: col('sourceTopicId', 'int', nullable) },
  {
    table: 'content_articles',
    column: col('sourceMaterials', 'json', nullable),
  },
];

export class AddHotTopics1792915200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    for (const definition of definitions) {
      if (!(await runner.hasTable(definition.name))) {
        await runner.createTable(
          new Table({
            ...definition,
            columns: [...base, ...definition.columns],
          }),
        );
      }
    }
    for (const { table, column } of additions) {
      if (
        (await runner.hasTable(table)) &&
        !(await runner.hasColumn(table, column.name))
      ) {
        await runner.addColumn(table, new TableColumn(column));
      }
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    // 不让回滚静默删除来源、选题或文章引用。先统一预检，再执行 DDL。
    for (const { name } of definitions) {
      if (await runner.hasTable(name)) {
        const rows = (await runner.query(
          `SELECT COUNT(*) AS total FROM \`${name}\``,
        )) as { total: string | number }[];
        if (Number(rows[0]?.total))
          throw new Error('热点数据已存在，请先人工归档后再回退迁移');
      }
    }
    const originPredicates: string[] = [];
    for (const column of ['sourceTopicId', 'sourceMaterials']) {
      if (await runner.hasColumn('content_articles', column))
        originPredicates.push(`${column} IS NOT NULL`);
    }
    if (originPredicates.length) {
      const rows = (await runner.query(
        `SELECT COUNT(*) AS total FROM content_articles WHERE ${originPredicates.join(' OR ')}`,
      )) as { total: string | number }[];
      if (Number(rows[0]?.total))
        throw new Error('文章来源快照已存在，请先人工归档后再回退迁移');
    }
    if (await runner.hasColumn('ai_feature_configs', 'webSearchMode')) {
      const rows = (await runner.query(
        "SELECT COUNT(*) AS total FROM ai_feature_configs WHERE webSearchMode <> 'disabled' OR featureType = 'topicDiscovery'",
      )) as { total: string | number }[];
      if (Number(rows[0]?.total))
        throw new Error('热点 AI 配置已存在，请先人工归档后再回退迁移');
    }
    for (const { table, column } of [...additions].reverse()) {
      if (await runner.hasColumn(table, column.name))
        await runner.dropColumn(table, column.name);
    }
    for (const { name } of [...definitions].reverse()) {
      if (await runner.hasTable(name)) await runner.dropTable(name);
    }
  }
}
