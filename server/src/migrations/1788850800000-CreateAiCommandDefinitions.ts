import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiCommandDefinitions1788850800000 implements MigrationInterface {
  name = 'CreateAiCommandDefinitions1788850800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `ai_command_definitions` (`id` int NOT NULL AUTO_INCREMENT, `commandKey` varchar(100) NOT NULL, `name` varchar(120) NOT NULL, `semanticKeywords` text NULL, `action` varchar(20) NOT NULL, `executionMode` varchar(20) NOT NULL, `handlerKey` varchar(100) NOT NULL, `executionTarget` varchar(240) NOT NULL, `apiMethod` varchar(12) NOT NULL, `apiPath` varchar(240) NOT NULL, `requestSchema` text NOT NULL, `contextBindings` text NOT NULL, `chatCallable` tinyint NOT NULL DEFAULT 0, `requireApproval` tinyint NOT NULL DEFAULT 0, `isEnabled` tinyint NOT NULL DEFAULT 1, `description` text NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `deletedAt` datetime NULL, UNIQUE INDEX `IDX_ai_command_definition_key` (`commandKey`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `ai_command_definitions`');
  }
}
