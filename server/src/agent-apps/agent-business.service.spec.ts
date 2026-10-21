import type { EntityManager } from 'typeorm';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { DemoService } from '../demo/demo.service';
import type { ProductCatalogService } from '../product-catalog/product-catalog.service';
import type { KnowledgeStandardQasService } from '../knowledge-standard-qas/knowledge-standard-qas.service';
import type { KnowledgeColloquialTermsService } from '../knowledge-colloquial-terms/knowledge-colloquial-terms.service';
import type { KnowledgeBasesService } from '../knowledge-bases/knowledge-bases.service';
import type { ContentArticlesService } from '../content-articles/content-articles.service';
import { AgentBusinessService } from './agent-business.service';
import { AGENT_BUSINESS_TOOLS } from './agent-business.registry';
import { parseAgentBusinessPlan } from './agent-business-plan';

const admin: AuthUser = {
  userId: 1,
  username: 'root',
  isAdmin: true,
  permissions: [],
  roles: [],
};
const makeCrud = () => ({
  findAll: jest.fn().mockResolvedValue({ list: [], total: 0 }),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 12 }),
});
describe('Agent reusable business adapters', () => {
  const demo = makeCrud();
  const products = {
    findProducts: jest.fn().mockResolvedValue({ list: [], total: 0 }),
    findProduct: jest.fn().mockResolvedValue({ id: 1 }),
    createProduct: jest.fn().mockResolvedValue({ id: 2 }),
    findSkus: jest.fn().mockResolvedValue({ list: [], total: 0 }),
    findSku: jest.fn().mockResolvedValue({ id: 1 }),
    findProductOptions: jest
      .fn()
      .mockResolvedValue([{ id: 1, name: '产品', productCode: 'P1' }]),
  };
  const qa = makeCrud();
  const terms = makeCrud();
  const knowledge = {
    findBases: jest.fn().mockResolvedValue({ list: [], total: 0 }),
    findBase: jest.fn().mockResolvedValue({ id: 1 }),
    createBase: jest.fn().mockResolvedValue({ id: 9 }),
    findCategories: jest.fn().mockResolvedValue([{ id: 7, name: '售前' }]),
    findCategoriesPage: jest
      .fn()
      .mockResolvedValue({ list: [{ id: 7, name: '售前' }], total: 1 }),
    findCategory: jest.fn().mockResolvedValue({ id: 7, name: '售前' }),
    createCategory: jest.fn().mockResolvedValue({ id: 8 }),
  };
  const articles = {
    findAll: jest.fn().mockResolvedValue({ list: [], total: 0 }),
    findOne: jest.fn().mockResolvedValue({ id: 1 }),
    generationConfigOptions: jest.fn().mockResolvedValue({
      list: [
        {
          id: 6,
          name: '文章助手',
          model: 'qwen-plus',
          responseFormat: 'text',
        },
      ],
      total: 1,
    }),
    templateOptions: jest.fn().mockResolvedValue({
      list: [{ id: 8, name: '热点解读' }],
      total: 1,
    }),
    createAndQueueGeneration: jest
      .fn()
      .mockResolvedValue({ id: 18, taskId: 29, taskStatus: 'pending' }),
  };
  const service = new AgentBusinessService(
    demo as unknown as DemoService,
    products as unknown as ProductCatalogService,
    qa as unknown as KnowledgeStandardQasService,
    terms as unknown as KnowledgeColloquialTermsService,
    knowledge as unknown as KnowledgeBasesService,
    articles as unknown as ContentArticlesService,
  );
  beforeEach(() => jest.clearAllMocks());

  it('registers controlled business tools for eight modules, not arbitrary controllers', () => {
    expect(AGENT_BUSINESS_TOOLS).toHaveLength(22);
    for (const key of [
      'user.create',
      'role.list',
      'product.delete',
      'standardQa.update',
      'knowledgeBase.index',
      'knowledgeCategory.update',
      'knowledgeCategory.delete',
      'contentArticle.delete',
    ])
      expect(
        AGENT_BUSINESS_TOOLS.find((tool) => tool.commandKey === key),
      ).toBeUndefined();
  });

  it.each(
    AGENT_BUSINESS_TOOLS.filter((tool) => tool.operation !== 'create').map(
      (tool) => [tool.commandKey, tool.operation],
    ),
  )('dispatches %s through its real read service', async (key, operation) => {
    const result = await service.query(
      key,
      operation === 'list' ? { page: 2, pageSize: 500 } : { id: 1 },
      admin,
    );
    expect(result.toolKey).toBe(key);
    expect(result.pageSize).toBe(operation === 'list' ? 20 : 1);
  });

  it('projects only registered fields from returned entities', async () => {
    demo.findAll.mockResolvedValueOnce({
      list: [
        {
          id: 1,
          title: '测试',
          secretKey: 'never-return',
          deletedAt: 'private',
        },
      ],
      total: 1,
    });
    const result = await service.query('demo.list', {}, admin);
    expect(result.list).toEqual([{ id: 1, title: '测试' }]);
  });

  it('checks employee rights including related product/category reads', async () => {
    const employee = {
      ...admin,
      isAdmin: false,
      permissions: ['ProductSku.create', 'KnowledgeBase.create'],
    };
    expect(service.permissionError('productSku.create', employee)).toContain(
      'Product.read',
    );
    expect(service.permissionError('knowledgeBase.create', employee)).toContain(
      'KnowledgeBase.read',
    );
    expect(
      service.permissionError('knowledgeCategory.create', employee),
    ).toContain('KnowledgeBase.read');
    await expect(
      service.query('standardQa.list', {}, employee),
    ).rejects.toThrow('KnowledgeStandardQa.read');
    expect(qa.findAll).not.toHaveBeenCalled();
  });

  it('reuses DTO rules, validates required/type fields and blocks extra write fields', () => {
    expect(
      service.validate('demo.create', { title: '测试', email: 'bad-email' })
        .validationErrors.length,
    ).toBeGreaterThan(0);
    expect(
      service.validate('product.create', { name: '测试' }).missingFields,
    ).toContain('产品编码');
    expect(
      service.validate('productSku.create', {
        productId: 1,
        specifications: {},
      }).validationErrors,
    ).toContain('规格参数格式不正确');
    expect(
      service.validate('colloquialTerm.create', {
        term: '垫子',
        replacement: '靠枕',
        semanticDefinition: '产品别名',
        isEnabled: 'false',
      }).validationErrors,
    ).toContain('是否启用格式不正确');
    expect(
      service.validate('standardQa.create', {
        question: '保修多久',
        answer: '一年',
        isActive: 'yes',
      }).validationErrors[0],
    ).toContain('isActive');
    expect(
      service.validate('knowledgeBase.create', {
        name: '售后',
        categoryId: 7,
        contentText: '资料',
        fileUrl: 'https://example.com',
      }).validationErrors[0],
    ).toContain('fileUrl');
  });

  it('uses safe defaults and transaction-scoped business services, with QA disabled by default', async () => {
    const manager = {} as EntityManager;
    await service.create(
      'standardQa.create',
      { question: '保修多久', answer: '一年' },
      admin,
      manager,
    );
    expect(qa.create).toHaveBeenCalledWith(
      { question: '保修多久', answer: '一年', isActive: false },
      manager,
    );
    await service.create(
      'colloquialTerm.create',
      { term: '枕头', replacement: '靠枕', semanticDefinition: '产品' },
      admin,
      manager,
    );
    expect(terms.create).toHaveBeenCalledWith(
      expect.objectContaining({ isEnabled: false }),
      manager,
    );
    await service.create(
      'knowledgeBase.create',
      { categoryId: 7, name: '售后', contentText: '文本' },
      admin,
      manager,
    );
    expect(knowledge.createBase).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'text', isEnabled: false }),
      manager,
    );
    await service.create('demo.create', { title: '示例' }, admin, manager);
    expect(demo.create).toHaveBeenCalledWith({ title: '示例' }, manager);
    await service.create(
      'product.create',
      { productCode: 'P1', name: '产品' },
      admin,
      manager,
    );
    expect(products.createProduct).toHaveBeenCalledWith(
      { productCode: 'P1', name: '产品' },
      manager,
    );
  });

  it('returns field metadata and real category choices for the shared form', async () => {
    const form = await service.form('knowledgeBase.create', admin);
    expect(
      form.fields.find((field) => field.prop === 'categoryId')?.options,
    ).toEqual([{ label: '售前', value: 7 }]);
    expect(
      form.fields.find((field) => field.prop === 'contentText')?.required,
    ).toBe(true);
    expect(form.note).toContain('索引须在知识库页面执行');
  });

  it('prepares an article generation pendingAction and queues it only through confirmation', async () => {
    const prepared = await service.prepare(
      'contentArticle.generate',
      { idea: '这是我的文章想法\n后续素材' },
      admin,
    );
    expect(prepared).toEqual(
      expect.objectContaining({
        title: '这是我的文章想法',
        aiConfigId: 6,
      }),
    );
    const form = await service.form('contentArticle.generate', admin);
    expect(
      form.fields.find((field) => field.prop === 'aiConfigId')?.options,
    ).toEqual([{ label: '文章助手 · qwen-plus', value: 6 }]);
    expect(
      form.fields.find((field) => field.prop === 'templateId')?.options,
    ).toEqual([{ label: '热点解读', value: 8 }]);
    const manager = {} as EntityManager;
    await expect(
      service.create('contentArticle.generate', prepared, admin, manager),
    ).resolves.toEqual({ id: 18, taskId: 29, taskStatus: 'pending' });
    expect(articles.createAndQueueGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        idea: '这是我的文章想法\n后续素材',
        aiConfigId: 6,
      }),
      admin.userId,
      true,
      manager,
    );
  });

  it('creates categories only with valid fields and the confirmation transaction manager', async () => {
    const form = await service.form('knowledgeCategory.create', admin);
    expect(
      form.fields.find((field) => field.prop === 'parentId')?.options,
    ).toEqual([{ label: '售前', value: 7 }]);
    expect(
      service.validate('knowledgeCategory.create', {}).missingFields,
    ).toContain('分类名称');
    expect(
      service.validate('knowledgeCategory.create', {
        name: '新分类',
        code: 'x'.repeat(81),
      }).validationErrors.length,
    ).toBeGreaterThan(0);
    const manager = {} as EntityManager;
    await service.create(
      'knowledgeCategory.create',
      { name: '子分类', parentId: 7 },
      admin,
      manager,
    );
    expect(knowledge.createCategory).toHaveBeenCalledWith(
      { name: '子分类', parentId: 7 },
      manager,
    );
    await expect(
      service.query('knowledgeCategory.create', { name: '禁止直写' }, admin),
    ).rejects.toThrow('待确认操作确认');
  });

  it('accepts only constrained JSON plans and never dispatches supplied URLs', () => {
    expect(
      parseAgentBusinessPlan(
        '```json\n{"kind":"tool","toolKey":"demo.list","parameters":{"keyword":"测试"}}\n```',
        ['demo.list'],
      ).parameters,
    ).toEqual({ keyword: '测试' });
    expect(() =>
      parseAgentBusinessPlan(
        '{"kind":"tool","toolKey":"user.create","parameters":{}}',
        ['demo.list'],
      ),
    ).toThrow('未授权');
    expect(() => parseAgentBusinessPlan('我已成功写入', ['demo.list'])).toThrow(
      '未执行写入',
    );
    expect(() =>
      parseAgentBusinessPlan(
        '{"kind":"tool","toolKey":"demo.list","parameters":[]}',
        ['demo.list'],
      ),
    ).toThrow('参数格式');
  });
});
