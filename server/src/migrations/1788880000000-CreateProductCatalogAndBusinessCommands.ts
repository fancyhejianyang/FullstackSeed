import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductCatalogAndBusinessCommands1788880000000
  implements MigrationInterface
{
  name = 'CreateProductCatalogAndBusinessCommands1788880000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `products` (`id` int NOT NULL AUTO_INCREMENT, `productCode` varchar(80) NOT NULL, `name` varchar(160) NOT NULL, `aliases` text NULL, `category` varchar(80) NOT NULL DEFAULT \'\', `description` text NULL, `isEnabled` tinyint NOT NULL DEFAULT 1, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `deletedAt` datetime NULL, UNIQUE INDEX `IDX_products_product_code` (`productCode`), INDEX `IDX_products_name` (`name`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'CREATE TABLE `product_skus` (`id` int NOT NULL AUTO_INCREMENT, `productId` int NOT NULL, `skuCode` varchar(100) NOT NULL, `name` varchar(160) NOT NULL DEFAULT \'\', `specifications` text NOT NULL, `isEnabled` tinyint NOT NULL DEFAULT 1, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `deletedAt` datetime NULL, INDEX `IDX_product_skus_product_id` (`productId`), UNIQUE INDEX `IDX_product_skus_sku_code` (`skuCode`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'ALTER TABLE `external_apps` ADD `commandKeys` text NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` ADD `businessContext` text NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `knowledge_ai_chat_messages` DROP COLUMN `businessContext`',
    );
    await queryRunner.query('ALTER TABLE `external_apps` DROP COLUMN `commandKeys`');
    await queryRunner.query('DROP TABLE `product_skus`');
    await queryRunner.query('DROP TABLE `products`');
  }
}
