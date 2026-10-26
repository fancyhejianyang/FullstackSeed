import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { ModelEndpoint } from './entities/model-endpoint.entity';
import {
  CreateModelEndpointDto,
  QueryModelEndpointDto,
  UpdateModelEndpointDto,
} from './dto/model-endpoint.dto';
import {
  FUNCTION_LABELS,
  PLATFORM_LABELS,
  PROTOCOLS,
  CATEGORY_LABELS,
  CATEGORY_FUNCTIONS,
  MODEL_FUNCTIONS,
  MODEL_PROTOCOLS,
  modelCategory,
  protocolTaskMethod,
  type ModelFunction,
  type PlatformType,
} from './model-endpoint.constants';
import { MODEL_SPECIFIC_PRESETS } from './model-endpoint.presets';
import {
  BUILTIN_MODEL_ENDPOINTS,
  builtinModelEndpoint,
} from './model-endpoint.builtins';
import {
  TOKENHUB_DOCUMENTATION,
  TOKENHUB_OFFICIAL_PRESETS,
  TOKENHUB_UNVERIFIED_MODELS,
} from './tokenhub-official.presets';

@Injectable()
export class ModelEndpointsService implements OnModuleInit {
  constructor(
    @InjectRepository(ModelEndpoint)
    private readonly repository: Repository<ModelEndpoint>,
  ) {}

  async onModuleInit() {
    await this.importPresets();
  }

  async importPresets() {
    await this.retireSearchEndpoints();
    let added = 0;
    let skipped = 0;
    // 仅补缺项；编辑、停用、软删除过的预设不会在重启时被覆盖或复活。
    for (const preset of MODEL_SPECIFIC_PRESETS) {
      const existing = await this.repository.findOne({
        where: {
          platformType: preset.platformType,
          modelCode: preset.modelCode,
          functionType: preset.functionType,
        },
        withDeleted: true,
      });
      if (!existing) {
        try {
          await this.create(preset);
          added += 1;
        } catch (error) {
          if (!(error instanceof ConflictException)) throw error;
          skipped += 1;
        }
      } else skipped += 1;
    }
    return {
      added,
      skipped,
      total: MODEL_SPECIFIC_PRESETS.length,
      unverifiedModels: TOKENHUB_UNVERIFIED_MODELS,
    };
  }

  /** 精确软删除已移除的卡片类型，保留原始记录但释放其唯一键；重复执行无副作用。 */
  private async retireSearchEndpoints() {
    await this.repository
      .createQueryBuilder()
      .update(ModelEndpoint)
      .set({
        deletedAt: () => 'CURRENT_TIMESTAMP',
        isActive: false,
        routeKey: null,
      })
      .where('functionType = :retiredFunction', {
        retiredFunction: 'webSearch',
      })
      .andWhere('deletedAt IS NULL')
      .execute();
  }

  private assertCurrentEndpoint(row: ModelEndpoint) {
    if (
      row.functionType === 'webSearch' ||
      ['openaiChatSearch', 'openaiResponses'].includes(row.protocol)
    )
      throw new NotFoundException(
        '联网搜索接口卡片已移除，由系统自动处理采集策略',
      );
  }

  options() {
    return {
      platforms: Object.entries(PLATFORM_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      categories: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      functions: Object.entries(FUNCTION_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      protocols: MODEL_PROTOCOLS.map((value) => ({
        value,
        label: PROTOCOLS[value].label,
        functions: PROTOCOLS[value].functions,
        executionMode: PROTOCOLS[value].mode,
        taskMethod: protocolTaskMethod(value),
      })),
    };
  }

  async findAll(query: QueryModelEndpointDto) {
    if (
      (query.functionType &&
        !(MODEL_FUNCTIONS as readonly string[]).includes(query.functionType)) ||
      (query.category && !Object.hasOwn(CATEGORY_FUNCTIONS, query.category))
    )
      return { list: [], total: 0 };
    const scenes = query.category
      ? (CATEGORY_FUNCTIONS[
          query.category as keyof typeof CATEGORY_FUNCTIONS
        ] as readonly ModelFunction[])
      : null;
    if (scenes && query.functionType && !scenes.includes(query.functionType))
      return { list: [], total: 0 };
    if (query.source === 'builtin') {
      const keyword = query.keyword?.trim().toLowerCase();
      const list = BUILTIN_MODEL_ENDPOINTS.filter(
        (item) =>
          (!query.platformType || item.platformType === query.platformType) &&
          (!query.functionType || item.functionType === query.functionType) &&
          (!scenes || scenes.includes(item.functionType)) &&
          query.isActive !== false &&
          (!keyword ||
            `${item.modelName} ${item.apiPath}`
              .toLowerCase()
              .includes(keyword)),
      );
      const start = ((query.page ?? 1) - 1) * (query.pageSize ?? 12);
      return {
        list: list
          .slice(start, start + (query.pageSize ?? 12))
          .map((item) => ({ ...item })),
        total: list.length,
      };
    }
    const base = {
      ...(query.platformType ? { platformType: query.platformType } : {}),
      ...(query.functionType
        ? { functionType: query.functionType }
        : scenes
          ? { functionType: In([...scenes]) }
          : { functionType: In(MODEL_FUNCTIONS) }),
      protocol: In(MODEL_PROTOCOLS),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    };
    const keyword = query.keyword?.trim();
    const [rows, total] = await this.repository.findAndCount({
      where: keyword
        ? [
            { ...base, modelCode: Like(`%${keyword}%`) },
            { ...base, modelName: Like(`%${keyword}%`) },
          ]
        : base,
      order: {
        platformType: 'ASC',
        modelCode: 'ASC',
        functionType: 'ASC',
        id: 'DESC',
      },
      skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 12),
      take: query.pageSize ?? 12,
    });
    return { list: rows.map((row) => this.toView(row)), total };
  }

  private async entity(id: number) {
    if (id <= 0)
      throw new BadRequestException('系统通用规则只读，不能编辑、删除或停用');
    const row = await this.repository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('模型调用接口不存在');
    this.assertCurrentEndpoint(row);
    return row;
  }

  async findOne(id: number) {
    if (id < 0) {
      const rule = BUILTIN_MODEL_ENDPOINTS.find((item) => item.id === id);
      if (!rule) throw new NotFoundException('系统通用规则不存在');
      return { ...rule };
    }
    return this.toView(await this.entity(id));
  }

  async create(dto: CreateModelEndpointDto) {
    const row = this.repository.create({
      ...dto,
      isActive: dto.isActive ?? true,
    });
    this.validate(row);
    return this.save(row);
  }

  async update(id: number, dto: UpdateModelEndpointDto) {
    const row = await this.entity(id);
    Object.assign(row, dto);
    this.validate(row);
    return this.save(row);
  }

  private async save(row: ModelEndpoint) {
    try {
      return this.toView(await this.repository.save(row));
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY')
        throw new ConflictException(
          '该平台、模型和功能场景已存在，请编辑现有卡片',
        );
      throw error;
    }
  }

  async remove(id: number) {
    await this.batchRemove([id]);
    return { id };
  }

  async batchRemove(ids: number[]) {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return { ids: [] };
    if (uniqueIds.some((id) => id <= 0))
      throw new BadRequestException('系统通用规则只读，不能删除');
    await this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ModelEndpoint);
      const rows = await repository.find({
        where: { id: In(uniqueIds) },
        lock: { mode: 'pessimistic_write' },
      });
      if (rows.length !== uniqueIds.length)
        throw new NotFoundException('部分模型调用接口不存在');
      for (const row of rows) this.assertCurrentEndpoint(row);
      await repository.update({ id: In(uniqueIds) }, { routeKey: null });
      await repository.softDelete(uniqueIds);
    });
    return { ids: uniqueIds };
  }

  /** 停用配置明确阻止调用；不能悄悄回退其它接口。 */
  async resolve(
    platformType: PlatformType,
    modelCode: string,
    functionType: ModelFunction,
  ) {
    if (functionType === 'webSearch')
      throw new BadRequestException('联网搜索不再使用模型接口卡片');
    const row = await this.repository.findOne({
      where: { platformType, modelCode, functionType },
    });
    if (row) this.assertCurrentEndpoint(row);
    if (row && !row.isActive)
      throw new BadRequestException('当前模型功能的调用接口已停用');
    return row
      ? { ...row, source: 'configured' as const, isReadOnly: false }
      : builtinModelEndpoint(platformType, functionType, modelCode);
  }

  overriddenModels(platformType: PlatformType, functionType: ModelFunction) {
    if (functionType === 'webSearch')
      throw new BadRequestException('联网搜索不再使用模型接口卡片');
    return this.repository.find({
      where: { platformType, functionType },
      select: { modelCode: true },
    });
  }

  imageRoutes() {
    return this.repository.find({ where: { functionType: 'textToImage' } });
  }

  buildUrl(baseUrl: string, path: string) {
    const base = new URL(baseUrl);
    if (
      base.protocol !== 'https:' ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    )
      throw new BadRequestException(
        '模型调用地址必须使用不含凭据、查询参数和片段的 HTTPS 地址',
      );
    this.validatePath(path, path.includes('{taskId}'));
    // 路径是相对服务域名的完整路径，不能叠加账号 Chat 路径或重复 /v1。
    return base.origin + path;
  }

  private validatePath(value: string, task: boolean) {
    const path = task ? value.replace('{taskId}', 'task-id') : value;
    if (
      !/^\/(?!\/)[A-Za-z0-9/_.-]+$/.test(path) ||
      path.split('/').some((part) => part === '.' || part === '..') ||
      (task && value.split('{taskId}').length !== 2)
    )
      throw new BadRequestException(
        '接口路径须以 / 开头，仅允许路径字符；任务路径必须包含一个 {taskId}',
      );
  }

  private validate(row: ModelEndpoint) {
    if (
      ![row.modelCode, row.modelName, row.apiPath].every(
        (value) => typeof value === 'string',
      ) ||
      !MODEL_PROTOCOLS.includes(row.protocol) ||
      !Object.hasOwn(PLATFORM_LABELS, row.platformType) ||
      !Object.hasOwn(FUNCTION_LABELS, row.functionType) ||
      typeof row.isActive !== 'boolean'
    )
      throw new BadRequestException(
        '平台、模型、功能场景、协议与启用状态必须有效',
      );
    row.modelCode = row.modelCode.trim();
    row.modelName = row.modelName.trim();
    row.apiPath = row.apiPath.trim();
    row.taskApiPath = row.taskApiPath?.trim() ?? '';
    if (!row.modelCode || !row.modelName || /[\s*?]/.test(row.modelCode))
      throw new BadRequestException(
        '模型编码和名称不能为空，模型编码须为具体名称，不能包含空白或通配符',
      );
    const definition = PROTOCOLS[row.protocol];
    if (
      !(definition.functions as readonly string[]).includes(row.functionType) ||
      definition.mode !== row.executionMode
    )
      throw new BadRequestException('功能场景、协议和同步/异步方式不匹配');
    if (
      (row.platformType === 'aliyunBailian' &&
        row.protocol.startsWith('tokenhub')) ||
      (row.platformType === 'tencentTokenhub' &&
        row.protocol.startsWith('dashscope'))
    )
      throw new BadRequestException('当前协议不属于所选平台');
    this.validatePath(row.apiPath, false);
    if (row.executionMode === 'async')
      this.validatePath(
        row.taskApiPath,
        protocolTaskMethod(row.protocol) === 'GET',
      );
    else row.taskApiPath = '';
    row.routeKey = `${row.platformType}:${row.modelCode}:${row.functionType}`;
  }

  private toView(row: ModelEndpoint) {
    this.assertCurrentEndpoint(row);
    const official =
      row.platformType === 'tencentTokenhub'
        ? TOKENHUB_OFFICIAL_PRESETS.find(
            (item) =>
              item.modelCode === row.modelCode &&
              item.functionType === row.functionType &&
              item.protocol === row.protocol &&
              item.apiPath === row.apiPath &&
              (item.taskApiPath ?? '') === row.taskApiPath,
          )
        : null;
    return {
      id: row.id,
      source: 'configured' as const,
      isReadOnly: false,
      platformType: row.platformType,
      modelCode: row.modelCode,
      modelName: row.modelName,
      functionType: row.functionType,
      protocol: row.protocol,
      apiPath: row.apiPath,
      taskApiPath: row.taskApiPath,
      taskMethod: protocolTaskMethod(row.protocol),
      category: modelCategory(row.functionType),
      documentationUrl: official
        ? TOKENHUB_DOCUMENTATION[`${row.modelCode}:${row.functionType}`]
        : null,
      executionMode: row.executionMode,
      isActive: !!row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
