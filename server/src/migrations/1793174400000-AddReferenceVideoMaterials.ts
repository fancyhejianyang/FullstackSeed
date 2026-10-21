import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddReferenceVideoMaterials1793174400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('ai_materials', 'referenceMedia'))) {
      await runner.addColumn(
        'ai_materials',
        new TableColumn({
          name: 'referenceMedia',
          type: 'json',
          isNullable: true,
        }),
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('ai_materials', 'referenceMedia'))) return;
    const rows = (await runner.query(
      "SELECT COUNT(*) AS total FROM `ai_materials` WHERE `generationMode` = 'referenceToVideo' OR `referenceMedia` IS NOT NULL",
    )) as Array<{ total: string | number }>;
    if (Number(rows[0]?.total ?? 0) > 0) {
      throw new Error('已有多参考视频素材，请人工归档后回退。');
    }
    await runner.dropColumn('ai_materials', 'referenceMedia');
  }
}
