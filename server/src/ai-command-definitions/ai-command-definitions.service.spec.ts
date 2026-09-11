import type { Repository } from 'typeorm';
import { AI_COMMAND_CATALOG_MAP } from './ai-command-definitions.constants';
import { AiCommandDefinition } from './entities/ai-command-definition.entity';
import { AiCommandDefinitionsService } from './ai-command-definitions.service';

describe('AiCommandDefinitionsService', () => {
  const existingProductCommand = {
    id: 9,
    commandKey: 'product.sku.lookup',
    name: '人工命名的产品查询',
    semanticKeywords: ['人工维护关键词'],
    chatCallable: true,
    requireApproval: false,
    isEnabled: false,
    description: '人工维护说明',
    action: 'execute',
    executionMode: 'api',
    handlerKey: 'legacy.handler',
    executionTarget: 'LegacyService.lookup',
    apiMethod: 'GET',
    apiPath: '/legacy-products',
    requestSchema: '{"legacy":true}',
    contextBindings: '{"legacy":true}',
  } as AiCommandDefinition;
  const definitionRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  const service = new AiCommandDefinitionsService(
    definitionRepository as unknown as Repository<AiCommandDefinition>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    definitionRepository.findOne.mockImplementation(({ where }) =>
      where.commandKey === 'product.sku.lookup'
        ? { ...existingProductCommand }
        : null,
    );
  });

  it('synchronizes the latest product command contract on startup while preserving manual settings', async () => {
    await service.syncCatalog();

    const expected = AI_COMMAND_CATALOG_MAP.get('product.sku.lookup')!;
    const savedProductCommand = definitionRepository.save.mock.calls
      .map(([value]) => value)
      .find((value) => value.commandKey === 'product.sku.lookup');

    expect(savedProductCommand).toEqual(
      expect.objectContaining({
        name: '人工命名的产品查询',
        semanticKeywords: ['人工维护关键词'],
        isEnabled: false,
        description: '人工维护说明',
        executionTarget: expected.executionTarget,
        apiMethod: expected.apiMethod,
        apiPath: expected.apiPath,
        requestSchema: expected.requestSchema,
        contextBindings: expected.contextBindings,
      }),
    );
  });
});
