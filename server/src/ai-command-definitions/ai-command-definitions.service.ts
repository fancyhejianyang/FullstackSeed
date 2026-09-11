import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import {
  AI_COMMAND_CATALOG,
  AI_COMMAND_CATALOG_MAP,
} from './ai-command-definitions.constants';
import {
  QueryAiCommandDefinitionDto,
  UpdateAiCommandDefinitionDto,
} from './dto/ai-command-definition.dto';
import { AiCommandDefinition } from './entities/ai-command-definition.entity';

@Injectable()
export class AiCommandDefinitionsService implements OnModuleInit {
  constructor(
    @InjectRepository(AiCommandDefinition)
    private readonly definitionRepository: Repository<AiCommandDefinition>,
  ) {}

  async onModuleInit() {
    await this.syncCatalog();
  }

  /**
   * 系统启动时同步代码白名单的执行契约。
   * 人工维护的名称、关键词、启停和调用授权保持不变；请求参数和执行映射
   * 始终以最新业务模块的注册结果为准，避免接口迭代后指令 Schema 过期。
   */
  async syncCatalog() {
    for (const item of AI_COMMAND_CATALOG) {
      const exists = await this.definitionRepository.findOne({
        where: { commandKey: item.commandKey },
      });
      if (!exists) {
        await this.definitionRepository.save(
          this.definitionRepository.create({
            ...item,
            semanticKeywords: item.semanticKeywords,
            isEnabled: true,
          }),
        );
        continue;
      }
      this.applyCatalogContract(exists);
      await this.definitionRepository.save(exists);
    }
  }

  async findAll(query: QueryAiCommandDefinitionDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = {
      ...(query.chatCallable !== undefined
        ? { chatCallable: query.chatCallable }
        : {}),
      ...(query.isEnabled !== undefined ? { isEnabled: query.isEnabled } : {}),
    };
    const conditions = query.keyword?.trim()
      ? [
          { ...where, commandKey: Like(`%${query.keyword.trim()}%`) },
          { ...where, name: Like(`%${query.keyword.trim()}%`) },
          { ...where, handlerKey: Like(`%${query.keyword.trim()}%`) },
          { ...where, description: Like(`%${query.keyword.trim()}%`) },
        ]
      : where;
    return this.definitionRepository
      .findAndCount({
        where: conditions,
        order: { id: 'ASC' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      })
      .then(([list, total]) => ({ list, total }));
  }

  async findOne(id: number) {
    return this.findEntity(id);
  }

  async findChatCommand(commandKey: string, allowedCommandKeys?: string[]) {
    if (allowedCommandKeys && !allowedCommandKeys.includes(commandKey)) {
      throw new BadRequestException(`当前聊天应用未授权指令“${commandKey}”`);
    }
    const definition = await this.definitionRepository.findOne({
      where: { commandKey, isEnabled: true, chatCallable: true },
    });
    if (!definition) {
      throw new BadRequestException(
        `聊天指令“${commandKey}”未启用或不允许调用`,
      );
    }
    return definition;
  }

  async update(id: number, dto: UpdateAiCommandDefinitionDto) {
    const definition = await this.findEntity(id);
    const catalog = AI_COMMAND_CATALOG_MAP.get(definition.commandKey);
    if (!catalog) {
      throw new BadRequestException('该指令不在系统白名单中，不能修改执行映射');
    }
    const payload = this.toPayload(dto, catalog.chatCallable);
    Object.assign(definition, payload);
    this.applyCatalogMapping(definition);
    return this.definitionRepository.save(definition);
  }

  getCatalog() {
    return AI_COMMAND_CATALOG;
  }

  private toPayload(
    dto: UpdateAiCommandDefinitionDto,
    catalogChatCallable: boolean,
  ) {
    const payload: Partial<AiCommandDefinition> = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('指令名称不能为空');
      payload.name = name;
    }
    if (dto.semanticKeywords !== undefined) {
      const keywords = Array.from(
        new Set(
          dto.semanticKeywords.map((item) => item.trim()).filter(Boolean),
        ),
      );
      payload.semanticKeywords = keywords.length ? keywords : null;
    }
    if (dto.chatCallable !== undefined) {
      if (dto.chatCallable && !catalogChatCallable) {
        throw new BadRequestException('该指令不允许开放给聊天模型');
      }
      payload.chatCallable = dto.chatCallable;
    }
    if (dto.requireApproval !== undefined)
      payload.requireApproval = dto.requireApproval;
    if (dto.isEnabled !== undefined) payload.isEnabled = dto.isEnabled;
    if (dto.description !== undefined) {
      const description = dto.description.trim();
      payload.description = description || null;
    }
    return payload;
  }

  private applyCatalogMapping(definition: AiCommandDefinition) {
    const catalog = AI_COMMAND_CATALOG_MAP.get(definition.commandKey)!;
    definition.action = catalog.action;
    definition.executionMode = catalog.executionMode;
    definition.handlerKey = catalog.handlerKey;
    definition.executionTarget = catalog.executionTarget;
    definition.apiMethod = catalog.apiMethod;
    definition.apiPath = catalog.apiPath;
    if (!catalog.chatCallable) definition.chatCallable = false;
  }

  private applyCatalogContract(definition: AiCommandDefinition) {
    const catalog = AI_COMMAND_CATALOG_MAP.get(definition.commandKey)!;
    this.applyCatalogMapping(definition);
    definition.requestSchema = catalog.requestSchema;
    definition.contextBindings = catalog.contextBindings;
  }


  private async findEntity(id: number) {
    const definition = await this.definitionRepository.findOne({
      where: { id },
    });
    if (!definition) throw new NotFoundException('指令不存在');
    return definition;
  }
}
