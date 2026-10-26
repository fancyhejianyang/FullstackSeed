import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddHotSourceCookie1793318400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasTable('hot_topic_sources'))) return;
    for (const column of [
      new TableColumn({
        name: 'cookieEncrypted',
        type: 'mediumtext',
        isNullable: true,
      }),
      new TableColumn({
        name: 'cookieUpdatedAt',
        type: 'datetime',
        isNullable: true,
      }),
    ]) {
      if (!(await runner.hasColumn('hot_topic_sources', column.name)))
        await runner.addColumn('hot_topic_sources', column);
    }
  }

  async down(): Promise<void> {
    // 凭据为用户主动配置数据，回滚代码时保留列，避免误删；不恢复明文或旧 apiToken。
  }
}
