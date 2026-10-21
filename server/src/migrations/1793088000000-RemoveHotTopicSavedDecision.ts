import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveHotTopicSavedDecision1793088000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (await runner.hasTable('hot_topics')) {
      await runner.query(
        "UPDATE `hot_topics` SET `decision` = 'new' WHERE `decision` = 'saved'",
      );
    }
  }

  async down(): Promise<void> {
    // “未处理”同时包含原本未处理的数据，无法无损识别历史收藏记录，因此不反向改写。
  }
}
