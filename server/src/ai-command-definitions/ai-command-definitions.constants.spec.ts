import {
  AI_BUSINESS_COMMAND_CATALOG,
  AI_COMMAND_CATALOG,
  AI_COMMAND_CATALOG_MAP,
} from './ai-command-definitions.constants';

describe('AI command catalog', () => {
  it('keeps every command key unique', () => {
    expect(AI_COMMAND_CATALOG_MAP.size).toBe(AI_COMMAND_CATALOG.length);
  });

  it('registers controlled business/content commands with explicit contracts', () => {
    const keys = new Set(
      AI_BUSINESS_COMMAND_CATALOG.map((item) => item.commandKey),
    );
    expect(keys.size).toBe(40);

    for (const moduleKey of [
      'demo',
      'product',
      'productSku',
      'standardQa',
      'colloquialTerm',
      'knowledgeBase',
    ]) {
      for (const suffix of [
        'list',
        'detail',
        'create',
        'update',
        'delete',
        'batchDelete',
      ]) {
        expect(keys).toContain(`${moduleKey}.${suffix}`);
      }
    }
    expect(keys).toContain('contentArticle.generate');
  });

  it('binds every business command to a concrete API and permission', () => {
    for (const command of AI_BUSINESS_COMMAND_CATALOG) {
      const bindings = JSON.parse(command.contextBindings) as {
        requiredPermission?: string;
        requiredPermissions?: string[];
        operatorId?: string;
      };

      if (command.commandKey === 'contentArticle.generate') {
        expect(command.executionMode).toBe('service');
        expect(command.apiPath).toBe(
          'service://content-articles/create-and-generate',
        );
        expect(bindings.requiredPermissions).toEqual([
          'ContentArticle.create',
          'ContentArticle.aiGenerate',
        ]);
      } else {
        expect(command.executionMode).toBe('api');
        expect(command.apiPath).toMatch(/^\/api\//);
        expect(bindings.requiredPermission).toMatch(
          /^(Demo|Product|ProductSku|KnowledgeStandardQa|KnowledgeColloquialTerm|KnowledgeBase)\.(read|create|update|delete|batchDelete)$/,
        );
      }
      expect(bindings.operatorId).toBe('$operator.id');
    }
  });

  it('requires confirmation for chat-callable writes and keeps destructive actions closed', () => {
    const chatWrites = AI_BUSINESS_COMMAND_CATALOG.filter(
      (item) => item.chatCallable && item.action !== 'read',
    );
    expect(chatWrites.map((item) => item.commandKey)).toEqual([
      'standardQa.create',
      'colloquialTerm.create',
      'knowledgeBase.create',
      'knowledgeCategory.create',
      'demo.create',
      'product.create',
      'productSku.create',
      'contentArticle.generate',
    ]);
    expect(chatWrites.every((item) => item.requireApproval)).toBe(true);

    const destructive = AI_BUSINESS_COMMAND_CATALOG.filter(
      (item) => item.action === 'delete',
    );
    expect(destructive.every((item) => !item.chatCallable)).toBe(true);
    expect(destructive.every((item) => item.requireApproval)).toBe(true);
  });

  it('does not register sensitive platform administration modules', () => {
    const keys = AI_BUSINESS_COMMAND_CATALOG.map((item) => item.commandKey);
    for (const prefix of [
      'user.',
      'role.',
      'permission.',
      'menu.',
      'log.',
      'storage.',
      'provider.',
    ]) {
      expect(keys.some((key) => key.startsWith(prefix))).toBe(false);
    }
  });

  it('keeps the demo create contract aligned with the real DTO boundary', () => {
    const command = AI_COMMAND_CATALOG_MAP.get('demo.create');
    const schema = JSON.parse(command!.requestSchema) as {
      required: string[];
      properties: Record<string, unknown>;
    };

    expect(command).toEqual(
      expect.objectContaining({
        apiMethod: 'POST',
        apiPath: '/api/demo',
        chatCallable: true,
        requireApproval: true,
      }),
    );
    expect(schema.required).toEqual(['title']);
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining([
        'title',
        'content',
        'category',
        'isActive',
        'quantity',
        'unitPrice',
        'budgetAmount',
      ]),
    );
  });
});
