import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 此模块仅配置文件上传后的预拆分边界，不承担 AI 文档内容解析。
 * 仅升级历史默认名称，不覆盖管理员自行维护的菜单名称。
 */
export class RenameDocumentUploadSplitRuleMenu1788907600000
  implements MigrationInterface
{
  name = 'RenameDocumentUploadSplitRuleMenu1788907600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "UPDATE `menus` SET `name` = '文档上传拆分规则' WHERE `path` = '/system-config/document-parse' AND `name` = '文档解析规则'",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "UPDATE `menus` SET `name` = '文档解析规则' WHERE `path` = '/system-config/document-parse' AND `name` = '文档上传拆分规则'",
    );
  }
}
