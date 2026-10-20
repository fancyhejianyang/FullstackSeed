import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Like, Repository } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import {
  ComposeVisualPromptDto,
  QueryVisualPromptTemplateDto,
  SaveVisualPromptTemplateDto,
} from './dto/visual-prompt-template.dto';
import { VisualPromptTemplate } from './entities/visual-prompt-template.entity';
import {
  parseComposedVisualPrompt,
  parseExtractedVisualPrompt,
  VISUAL_PROMPT_COMPOSE_SYSTEM,
  VISUAL_PROMPT_EXTRACT_SYSTEM,
} from './visual-prompt.protocol';

@Injectable()
export class VisualPromptTemplatesService {
  constructor(
    @InjectRepository(VisualPromptTemplate)
    private readonly repository: Repository<VisualPromptTemplate>,
    private readonly configs: AiFeatureConfigsService,
    private readonly providers: KnowledgeAiProvidersService,
  ) {}

  async findAll(query: QueryVisualPromptTemplateDto, userId: number) {
    const base = {
      userId,
      ...(query.mediaType ? { mediaType: query.mediaType } : {}),
    };
    const keyword = query.keyword?.trim();
    const [list, total] = await this.repository.findAndCount({
      select: {
        id: true,
        name: true,
        mediaType: true,
        targetModel: true,
        styleSummary: true,
        aiConfigName: true,
        version: true,
        isEnabled: true,
        extractedAt: true,
        updatedAt: true,
      },
      where: keyword
        ? [
            { ...base, name: Like(`%${keyword}%`) },
            { ...base, targetModel: Like(`%${keyword}%`) },
            { ...base, styleSummary: Like(`%${keyword}%`) },
          ]
        : base,
      order: { id: 'DESC' },
      skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 10),
      take: query.pageSize ?? 10,
    });
    return { list, total };
  }

  async findOne(id: number, userId: number) {
    const row = await this.repository.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('视觉提示词模板不存在');
    return row;
  }

  async options(query: QueryVisualPromptTemplateDto, userId: number) {
    const qb = this.repository
      .createQueryBuilder('template')
      .where('template.userId = :userId', { userId })
      .andWhere('template.isEnabled = :enabled', { enabled: true })
      .andWhere('template.mediaType = :mediaType', {
        mediaType: query.mediaType ?? 'image',
      });
    if (query.targetModel?.trim()) {
      qb.andWhere(
        '(template.targetModel = :model OR template.targetModel IS NULL)',
        {
          model: query.targetModel.trim(),
        },
      ).orderBy('template.targetModel IS NULL', 'ASC');
    } else {
      qb.orderBy('template.id', 'DESC');
    }
    return qb
      .select([
        'template.id',
        'template.name',
        'template.mediaType',
        'template.targetModel',
        'template.styleSummary',
        'template.version',
      ])
      .take(100)
      .getMany();
  }

  async aiConfigOptions() {
    return this.configs.visualPromptOptions();
  }

  async create(dto: SaveVisualPromptTemplateDto, userId: number) {
    const config = await this.configs.findUsableVisualPromptConfig(
      dto.aiConfigId,
    );
    return this.repository.save(
      this.repository.create({
        ...this.payload(dto),
        userId,
        aiConfigName: config.name,
        version: 1,
      }),
    );
  }

  async syncFromComfyWorkflow(
    input: {
      templateId?: number | null;
      workflowName: string;
      mediaType: 'image' | 'video';
      targetModel?: string | null;
      positivePrompt: string;
      negativePrompt?: string | null;
    },
    userId: number,
    manager: EntityManager,
  ) {
    const sourcePrompt = input.positivePrompt.trim();
    if (!sourcePrompt) return null;
    const repository = manager.getRepository(VisualPromptTemplate);
    const existing = input.templateId
      ? await repository.findOne({ where: { id: input.templateId } })
      : null;
    let configCandidate = existing
      ? await this.configs
          .findUsableVisualPromptConfig(existing.aiConfigId)
          .catch(() => null)
      : null;
    configCandidate ??= await this.configs.findEnabledByFeature('visualPrompt');
    if (!configCandidate?.id) return null;
    const config = await this.configs
      .findUsableVisualPromptConfig(configCandidate.id)
      .catch(() => null);
    if (!config?.id || !config.name) return null;

    const name = `${input.workflowName.trim()} · 工作流提示词`.slice(0, 120);
    const negativePrompt = input.negativePrompt?.trim() || null;
    const targetModel = input.targetModel?.trim() || null;
    const common = {
      userId: existing?.userId ?? userId,
      name,
      mediaType: input.mediaType,
      targetModel,
      sourcePlatform: 'ComfyUI 工作流',
      aiConfigId: config.id,
      aiConfigName: config.name,
      sourcePrompt,
      sourceNegativePrompt: negativePrompt,
      positiveTemplate: sourcePrompt,
      negativeTemplate: negativePrompt,
      styleSummary: `从 ComfyUI 工作流“${input.workflowName.trim()}”的示例提示词自动建立`,
      modelRules: null,
      variables: null,
      isEnabled: true,
      extractedAt: null,
    };
    if (existing) {
      Object.assign(existing, common, { version: existing.version + 1 });
      return repository.save(existing);
    }
    return repository.save(
      repository.create({
        ...common,
        version: 1,
      }),
    );
  }

  async update(id: number, dto: SaveVisualPromptTemplateDto, userId: number) {
    const row = await this.findOne(id, userId);
    const config = await this.configs.findUsableVisualPromptConfig(
      dto.aiConfigId,
    );
    Object.assign(row, this.payload(dto), {
      aiConfigName: config.name,
      version: row.version + 1,
    });
    return this.repository.save(row);
  }

  async extract(id: number, userId: number) {
    const row = await this.findOne(id, userId);
    const config = await this.configs.findUsableVisualPromptConfig(
      row.aiConfigId,
    );
    const response = await this.call(config, VISUAL_PROMPT_EXTRACT_SYSTEM, {
      mediaType: row.mediaType,
      targetModel: row.targetModel || '通用模型',
      sourcePlatform: row.sourcePlatform,
      positiveExample: row.sourcePrompt,
      negativeExample: row.sourceNegativePrompt,
      existingRules: row.modelRules,
    });
    const parsed = parseExtractedVisualPrompt(response);
    if (!parsed)
      throw new BadGatewayException(
        'AI 未返回有效的视觉提示词模板结构，请调整配置后重试',
      );
    Object.assign(row, parsed, {
      extractedAt: new Date(),
      version: row.version + 1,
    });
    return this.repository.save(row);
  }

  async compose(id: number, dto: ComposeVisualPromptDto, userId: number) {
    const row = await this.findOne(id, userId);
    return this.composeRow(row, dto);
  }

  async composeBound(id: number, dto: ComposeVisualPromptDto) {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('工作流绑定的视觉提示词模板不存在');
    return this.composeRow(row, dto);
  }

  private async composeRow(
    row: VisualPromptTemplate,
    dto: ComposeVisualPromptDto,
  ) {
    if (!row.isEnabled) throw new BadRequestException('该视觉提示词模板已停用');
    const targetModel =
      dto.targetModel?.trim() || row.targetModel || '通用模型';
    if (
      row.targetModel &&
      dto.targetModel &&
      row.targetModel !== dto.targetModel.trim()
    )
      throw new BadRequestException(`该模板仅适用于模型 ${row.targetModel}`);
    const config = await this.configs.findUsableVisualPromptConfig(
      row.aiConfigId,
    );
    const response = await this.call(config, VISUAL_PROMPT_COMPOSE_SYSTEM, {
      mediaType: row.mediaType,
      targetModel,
      idea: dto.idea,
      positiveTemplate: row.positiveTemplate || row.sourcePrompt,
      negativeTemplate: row.negativeTemplate || row.sourceNegativePrompt,
      styleSummary: row.styleSummary,
      modelRules: row.modelRules,
      variables: row.variables,
    });
    const parsed = parseComposedVisualPrompt(response);
    if (!parsed)
      throw new BadGatewayException(
        'AI 未返回有效的正向与负向提示词结构，请调整配置后重试',
      );
    return {
      ...parsed,
      templateId: row.id,
      templateVersion: row.version,
      targetModel,
    };
  }

  async remove(id: number, userId: number) {
    await this.findOne(id, userId);
    await this.repository.softDelete({ id, userId });
    return { id };
  }

  async batchRemove(ids: number[], userId: number) {
    const unique = [...new Set(ids)];
    if (
      (await this.repository.count({ where: { id: In(unique), userId } })) !==
      unique.length
    )
      throw new NotFoundException('部分视觉提示词模板不存在');
    await this.repository.softDelete({ id: In(unique), userId });
    return { ids: unique };
  }

  private payload(dto: SaveVisualPromptTemplateDto) {
    const optional = (value?: string) => value?.trim() || null;
    return {
      name: dto.name.trim(),
      mediaType: dto.mediaType,
      targetModel: optional(dto.targetModel),
      sourcePlatform: optional(dto.sourcePlatform),
      aiConfigId: dto.aiConfigId,
      sourcePrompt: dto.sourcePrompt.trim(),
      sourceNegativePrompt: optional(dto.sourceNegativePrompt),
      positiveTemplate: optional(dto.positiveTemplate),
      negativeTemplate: optional(dto.negativeTemplate),
      styleSummary: optional(dto.styleSummary),
      modelRules: optional(dto.modelRules),
      variables:
        dto.variables?.map((item) => item.trim()).filter(Boolean) || null,
      isEnabled: dto.isEnabled ?? true,
    };
  }

  private async call(
    config: Awaited<
      ReturnType<AiFeatureConfigsService['findUsableVisualPromptConfig']>
    >,
    builtIn: string,
    data: object,
  ) {
    const response = await this.providers.withExecutionSignal(
      AbortSignal.timeout(120000),
      () =>
        this.providers.callChat({
          id: config.providerId!,
          model: config.model!,
          temperature: config.temperature,
          systemPrompt: [config.systemPrompt?.trim(), builtIn]
            .filter(Boolean)
            .join('\n\n'),
          question: JSON.stringify(data),
        }),
    );
    if (!response.isSuccess)
      throw new BadGatewayException(
        '视觉提示词 AI 调用失败，请检查模型账号、模型和网络后重试',
      );
    return response.answer;
  }
}
