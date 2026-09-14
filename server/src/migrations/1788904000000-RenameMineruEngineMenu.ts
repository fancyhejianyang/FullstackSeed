import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MinerU 仅维护外部解析服务的账号与引擎参数；文档解析提示词归 AI 功能配置管理。
 * 仅升级未被管理员改名的历史默认菜单，不覆盖现有菜单维护结果。
 */
export class RenameMineruEngineMenu1788904000000 implements MigrationInterface {
  name = 'RenameMineruEngineMenu1788904000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "UPDATE `menus` SET `name` = 'MinerU 引擎配置' WHERE `path` = '/system-config/mineru' AND `name` = 'MinerU 解析配置'",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "UPDATE `menus` SET `name` = 'MinerU 解析配置' WHERE `path` = '/system-config/mineru' AND `name` = 'MinerU 引擎配置'",
    );
  }
}
