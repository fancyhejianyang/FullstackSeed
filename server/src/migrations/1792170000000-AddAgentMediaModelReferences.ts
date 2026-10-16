import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class AddAgentMediaModelReferences1792170000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, name] of [
      ['agent_apps', 'mediaModels'],
      ['knowledge_ai_providers', 'imageGenerationModels'],
      ['knowledge_ai_providers', 'imageGenerationApiUrl'],
    ]) {
      if (
        (await queryRunner.hasTable(table)) &&
        !(await queryRunner.hasColumn(table, name))
      ) {
        await queryRunner.addColumn(
          table,
          new TableColumn({
            name,
            type: name === 'imageGenerationApiUrl' ? 'varchar' : 'text',
            ...(name === 'imageGenerationApiUrl' ? { length: '500' } : {}),
            isNullable: true,
          }),
        );
      }
    }
    if (
      (await queryRunner.hasTable('knowledge_ai_providers')) &&
      !(await queryRunner.hasColumn(
        'knowledge_ai_providers',
        'imageGenerationProtocol',
      ))
    ) {
      await queryRunner.addColumn(
        'knowledge_ai_providers',
        new TableColumn({
          name: 'imageGenerationProtocol',
          type: 'varchar',
          length: '24',
          default: "'openai'",
        }),
      );
    }
    if (!(await queryRunner.hasTable('agent_images'))) {
      await queryRunner.createTable(
        new Table({
          name: 'agent_images',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'updatedAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              onUpdate: 'CURRENT_TIMESTAMP',
            },
            { name: 'deletedAt', type: 'timestamp', isNullable: true },
            { name: 'userId', type: 'int' },
            { name: 'sessionId', type: 'int' },
            { name: 'mimeType', type: 'varchar', length: '40' },
            { name: 'size', type: 'int' },
            { name: 'source', type: 'varchar', length: '16' },
            { name: 'data', type: 'longblob' },
          ],
          indices: [
            {
              name: 'IDX_agent_images_owner_session',
              columnNames: ['userId', 'sessionId'],
            },
          ],
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('agent_images'))
      await queryRunner.dropTable('agent_images');
    for (const [table, name] of [
      ['agent_apps', 'mediaModels'],
      ['knowledge_ai_providers', 'imageGenerationModels'],
      ['knowledge_ai_providers', 'imageGenerationApiUrl'],
      ['knowledge_ai_providers', 'imageGenerationProtocol'],
    ]) {
      if (
        (await queryRunner.hasTable(table)) &&
        (await queryRunner.hasColumn(table, name))
      )
        await queryRunner.dropColumn(table, name);
    }
  }
}
