import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { EntityManager } from 'typeorm';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { DemoService } from '../demo/demo.service';
import { CreateDemoDto, QueryDemoDto } from '../demo/dto/demo.dto';
import { ProductCatalogService } from '../product-catalog/product-catalog.service';
import {
  CreateProductDto,
  CreateProductSkuDto,
  QueryProductDto,
  QueryProductSkuDto,
} from '../product-catalog/dto/product-catalog.dto';
import { KnowledgeStandardQasService } from '../knowledge-standard-qas/knowledge-standard-qas.service';
import {
  CreateKnowledgeStandardQaDto,
  QueryKnowledgeStandardQaDto,
} from '../knowledge-standard-qas/dto/knowledge-standard-qa.dto';
import { KnowledgeColloquialTermsService } from '../knowledge-colloquial-terms/knowledge-colloquial-terms.service';
import {
  CreateKnowledgeColloquialTermDto,
  QueryKnowledgeColloquialTermDto,
} from '../knowledge-colloquial-terms/dto/knowledge-colloquial-term.dto';
import { KnowledgeBasesService } from '../knowledge-bases/knowledge-bases.service';
import {
  CreateKnowledgeBaseDto,
  QueryKnowledgeBaseDto,
} from '../knowledge-bases/dto/knowledge-base.dto';
import {
  AGENT_BUSINESS_TOOLS,
  AGENT_BUSINESS_READ_FIELDS,
  getAgentBusinessTool,
  type AgentBusinessForm,
  type AgentBusinessModuleKey,
  type AgentFieldSchema,
} from './agent-business.registry';

interface BusinessAdapter {
  createDto: ClassConstructor<object>;
  queryDto: ClassConstructor<object>;
  list: (
    data: Record<string, unknown>,
  ) => Promise<{ list: object[]; total: number }>;
  detail: (id: number) => Promise<object>;
  create?: (
    data: Record<string, unknown>,
    manager: EntityManager,
  ) => Promise<{ id: number }>;
}

@Injectable()
export class AgentBusinessService {
  private readonly adapters: Record<AgentBusinessModuleKey, BusinessAdapter>;

  constructor(
    demo: DemoService,
    private readonly products: ProductCatalogService,
    qa: KnowledgeStandardQasService,
    terms: KnowledgeColloquialTermsService,
    private readonly knowledge: KnowledgeBasesService,
  ) {
    // 唯一服务绑定表。新增模块只声明 DTO、服务绑定和目录字段，不复制对话/草稿/确认流程。
    this.adapters = {
      demo: {
        createDto: CreateDemoDto,
        queryDto: QueryDemoDto,
        list: (d) => demo.findAll(d),
        detail: (id) => demo.findOne(id),
        create: (d, m) => demo.create(d as unknown as CreateDemoDto, m),
      },
      product: {
        createDto: CreateProductDto,
        queryDto: QueryProductDto,
        list: (d) => products.findProducts(d),
        detail: (id) => products.findProduct(id),
        create: (d, m) =>
          products.createProduct(d as unknown as CreateProductDto, m),
      },
      productSku: {
        createDto: CreateProductSkuDto,
        queryDto: QueryProductSkuDto,
        list: (d) => products.findSkus(d),
        detail: (id) => products.findSku(id),
      },
      standardQa: {
        createDto: CreateKnowledgeStandardQaDto,
        queryDto: QueryKnowledgeStandardQaDto,
        list: (d) => qa.findAll(d),
        detail: (id) => qa.findOne(id),
        create: (d, m) =>
          qa.create(
            {
              ...d,
              status: 'draft',
            } as unknown as CreateKnowledgeStandardQaDto,
            m,
          ),
      },
      colloquialTerm: {
        createDto: CreateKnowledgeColloquialTermDto,
        queryDto: QueryKnowledgeColloquialTermDto,
        list: (d) => terms.findAll(d),
        detail: (id) => terms.findOne(id),
        create: (d, m) =>
          terms.create(d as unknown as CreateKnowledgeColloquialTermDto, m),
      },
      knowledgeBase: {
        createDto: CreateKnowledgeBaseDto,
        queryDto: QueryKnowledgeBaseDto,
        list: (d) => knowledge.findBases(d),
        detail: (id) => knowledge.findBase(id),
        create: (d, m) =>
          knowledge.createBase(
            { ...d, contentType: 'text' } as unknown as CreateKnowledgeBaseDto,
            m,
          ),
      },
    };
    for (const tool of AGENT_BUSINESS_TOOLS) {
      if (!this.adapters[tool.moduleKey])
        throw new Error(`Agent 工具缺少服务绑定：${tool.commandKey}`);
    }
  }

  permissionError(key: string, user: AuthUser) {
    const tool = getAgentBusinessTool(key);
    if (!tool) return '该业务工具未接入执行器';
    const missing = [tool.permission, ...tool.extraPermissions].filter(
      (permission) => !user.isAdmin && !user.permissions.includes(permission),
    );
    return missing.length
      ? `当前员工缺少业务权限：${missing.join('、')}。`
      : null;
  }

  async form(key: string, user: AuthUser): Promise<AgentBusinessForm> {
    const tool = this.requireTool(key, user);
    const fields = tool.fields.map((field) => ({ ...field }));
    const product = fields.find((field) => field.prop === 'productId');
    if (
      product &&
      (user.isAdmin || user.permissions.includes('Product.read'))
    ) {
      product.options = (await this.products.findProductOptions()).map(
        (item) => ({
          value: item.id,
          label: `${item.name} (${item.productCode})`,
        }),
      );
    }
    const category = fields.find((field) => field.prop === 'categoryId');
    if (category) {
      category.options = (await this.knowledge.findCategories({})).map(
        (item) => ({ value: item.id, label: item.name }),
      );
    }
    return {
      name: tool.name,
      fields,
      permission: tool.permission,
      detailPath: tool.detailPath,
      note: tool.note,
    };
  }

  validate(key: string, input: Record<string, unknown>) {
    const tool = getAgentBusinessTool(key);
    if (!tool) throw new BadRequestException('业务工具不存在');
    const missingFields: string[] = [];
    const validationErrors: string[] = [];
    if (JSON.stringify(input).length > 64000)
      throw new BadRequestException('业务参数过长，请分次录入');
    const allowed = new Set(tool.fields.map((f) => f.prop));
    // 历史 SKU 展示名称不是提交字段。
    const unknown = Object.keys(input).filter(
      (key) =>
        !allowed.has(key) &&
        !(tool.moduleKey === 'productSku' && key === 'productName'),
    );
    if (unknown.length)
      validationErrors.push(`不允许的字段：${unknown.join('、')}`);
    const data: Record<string, unknown> = {};
    for (const field of tool.fields) {
      const raw = Object.hasOwn(input, field.prop)
        ? input[field.prop]
        : field.default;
      const value = typeof raw === 'string' ? raw.trim() : raw;
      if (value === undefined || value === null || value === '') {
        if (field.required) missingFields.push(field.label);
        continue;
      }
      if (!this.validValue(field, value))
        validationErrors.push(`${field.label}格式不正确`);
      else data[field.prop] = value;
    }
    if (tool.operation === 'list') {
      data.page = Math.min(Number(data.page ?? 1), 10000);
      data.pageSize = Math.min(Number(data.pageSize ?? 10), 20);
    }
    if (tool.operation !== 'detail') {
      const adapter = this.adapters[tool.moduleKey];
      const dto = plainToInstance(
        tool.operation === 'create' ? adapter.createDto : adapter.queryDto,
        data,
      );
      // 内部调用 Service 不经过 HTTP ValidationPipe，必须在这里再次复用 DTO 校验。
      const errors = validateSync(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
        skipMissingProperties: true,
      });
      for (const error of errors)
        validationErrors.push(...Object.values(error.constraints ?? {}));
    }
    return { data, missingFields, validationErrors };
  }

  async query(key: string, input: Record<string, unknown>, user: AuthUser) {
    const tool = this.requireTool(key, user);
    if (tool.operation === 'create')
      throw new BadRequestException('写入工具必须经过草稿确认');
    const data = this.validated(key, input);
    const adapter = this.adapters[tool.moduleKey];
    const result =
      tool.operation === 'list'
        ? await adapter.list(data)
        : { list: [await adapter.detail(Number(data.id))], total: 1 };
    // 只投影登记的业务字段；不把实体新增的内部/敏感列自动返回给模型或浏览器。
    const fields = [
      { prop: 'id', label: 'ID' },
      ...getAgentBusinessTool(`${tool.moduleKey}.create`)!.fields,
      ...(AGENT_BUSINESS_READ_FIELDS[tool.moduleKey] ?? []),
    ];
    const rows = result.list.map((row) =>
      Object.fromEntries(
        fields
          .filter((f) => Object.hasOwn(row, f.prop))
          .map((f) => {
            const value: unknown = (row as Record<string, unknown>)[f.prop];
            const serialized =
              typeof value === 'string' ? value : JSON.stringify(value);
            return [
              f.prop,
              serialized && serialized.length > 4000
                ? `${serialized.slice(0, 4000)}…（已截断，请打开业务页面查看全文）`
                : value,
            ];
          }),
      ),
    );
    return {
      toolKey: key,
      name: tool.name,
      fields: fields.map(({ prop, label }) => ({ prop, label })),
      list: rows,
      total: result.total,
      page: Number(data.page ?? 1),
      pageSize: Number(data.pageSize ?? 1),
      detailPath: tool.detailPath,
    };
  }

  async create(
    key: string,
    input: Record<string, unknown>,
    user: AuthUser,
    manager: EntityManager,
  ) {
    const tool = this.requireTool(key, user);
    const create = this.adapters[tool.moduleKey].create;
    if (tool.operation !== 'create' || !create)
      throw new BadRequestException('此工具不能通过通用写入入口调用');
    return create(this.validated(key, input), manager);
  }

  private requireTool(key: string, user: AuthUser) {
    const reason = this.permissionError(key, user);
    if (reason) throw new ForbiddenException(reason);
    return getAgentBusinessTool(key)!;
  }

  private validated(key: string, input: Record<string, unknown>) {
    const result = this.validate(key, input);
    if (result.missingFields.length || result.validationErrors.length)
      throw new BadRequestException(
        [
          ...result.missingFields.map((f) => `缺少${f}`),
          ...result.validationErrors,
        ].join('；'),
      );
    return result.data;
  }

  private validValue(field: AgentFieldSchema, value: unknown): boolean {
    if (field.enum && !field.enum.includes(String(value))) return false;
    switch (field.type) {
      case 'string':
        return (
          typeof value === 'string' &&
          value.length <= (field.maxLength ?? 32000) &&
          value.length >= (field.minLength ?? 0)
        );
      case 'integer':
      case 'number':
        return (
          typeof value === 'number' &&
          Number.isFinite(value) &&
          (field.type !== 'integer' || Number.isSafeInteger(value)) &&
          value >= (field.minimum ?? -Number.MAX_SAFE_INTEGER)
        );
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return (
          Array.isArray(value) &&
          value.length <= (field.maxItems ?? 100) &&
          value.every(
            (v: unknown) => !field.items || this.validValue(field.items, v),
          )
        );
      case 'object':
        return (
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          Object.keys(value).length >= (field.minProperties ?? 0) &&
          !/("(?:__proto__|constructor|prototype)"\s*:)/.test(
            JSON.stringify(value),
          )
        );
      default:
        return false;
    }
  }
}
