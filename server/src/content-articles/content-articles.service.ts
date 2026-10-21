import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EntityManager, In, IsNull, Like, Repository } from 'typeorm';
import { ContentGenerationService } from './content-generation.service';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { ContentTemplatesService } from '../content-templates/content-templates.service';
import { ContentArticle } from './entities/content-article.entity';
import type { ContentArticleOrigin } from './content-source.types';
import {
  CreateContentArticleDto,
  QueryContentArticleDto,
  UpdateContentArticleDto,
} from './dto/content-article.dto';

@Injectable()
export class ContentArticlesService {
  constructor(
    @InjectRepository(ContentArticle)
    private readonly repository: Repository<ContentArticle>,
    private readonly generation: ContentGenerationService,
    private readonly configs: AiFeatureConfigsService,
    private readonly templates: ContentTemplatesService,
  ) {}

  generationConfigOptions(query: QueryContentArticleDto = {}) {
    return this.generation.configOptions(query);
  }

  templateOptions(query: QueryContentArticleDto, userId: number) {
    return this.templates.findAll(query, userId);
  }

  async findAll(query: QueryContentArticleDto, userId: number) {
    const keyword = query.keyword?.trim();
    const [list, total] = await this.repository.findAndCount({
      select: {
        id: true,
        title: true,
        coverUrl: true,
        createdAt: true,
        updatedAt: true,
        version: true,
      },
      where: { userId, ...(keyword ? { title: Like(`%${keyword}%`) } : {}) },
      order: { id: 'DESC' },
      skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 10),
      take: query.pageSize ?? 10,
    });
    const tasks = await this.generation.latest(
      list.map((row) => row.id),
      userId,
    );
    const latest = new Map(tasks.map((task) => [task.articleId, task]));
    return {
      list: list.map((row) => ({
        ...row,
        latestTask: latest.get(row.id) ?? null,
      })),
      total,
    };
  }

  async findOne(id: number, userId: number) {
    const article = await this.repository.findOne({ where: { id, userId } });
    if (!article) throw new NotFoundException('内容不存在');
    return article;
  }

  async create(
    dto: CreateContentArticleDto,
    userId: number,
    canUseTemplates = false,
    manager?: EntityManager,
    origin?: ContentArticleOrigin,
  ) {
    const preferences = await this.preferences(
      dto,
      null,
      userId,
      canUseTemplates,
    );
    const repository =
      manager?.getRepository(ContentArticle) ?? this.repository;
    return repository.save(
      repository.create({
        ...this.fields(dto),
        ...preferences,
        userId,
        ...(origin
          ? { sourceTopicId: origin.topicId, sourceMaterials: origin.materials }
          : {}),
      }),
    );
  }

  /** 创建文章并在同一事务内登记异步生成任务，供 Agent 等复合入口调用。 */
  async createAndQueueGeneration(
    dto: CreateContentArticleDto & { aiConfigId: number },
    userId: number,
    canUseTemplates: boolean,
    manager: EntityManager,
    origin?: ContentArticleOrigin,
  ) {
    const article = await this.create(
      dto,
      userId,
      canUseTemplates,
      manager,
      origin,
    );
    const task = await this.generation.submitWithManager(
      article.id,
      {
        version: article.version,
        requestId: randomUUID(),
        aiConfigId: dto.aiConfigId,
        ...(dto.templateId ? { templateId: dto.templateId } : {}),
      },
      userId,
      manager,
    );
    return {
      id: article.id,
      taskId: task.id,
      taskStatus: task.status,
    };
  }

  async update(
    id: number,
    dto: UpdateContentArticleDto,
    userId: number,
    canUseTemplates = false,
  ) {
    const article = await this.findOne(id, userId);
    const preferences = await this.preferences(
      dto,
      article,
      userId,
      canUseTemplates,
    );
    const result = await this.repository.update(
      { id, userId, version: dto.version, deletedAt: IsNull() },
      {
        ...preferences,
        title: dto.title.trim(),
        ...(dto.coverUrl !== undefined ? { coverUrl: dto.coverUrl ?? '' } : {}),
        ...(dto.idea !== undefined ? { idea: dto.idea ?? '' } : {}),
        ...(dto.content !== undefined ? { content: dto.content ?? '' } : {}),
        version: dto.version + 1,
      },
    );
    if (result.affected !== 1)
      throw new ConflictException(
        '内容已被更新或删除，请保留当前文字并重新打开后编辑',
      );
    return this.findOne(id, userId);
  }

  async remove(id: number, userId: number) {
    await this.findOne(id, userId);
    await this.repository.softDelete({ id, userId });
    return { id };
  }

  async batchRemove(ids: number[], userId: number) {
    const uniqueIds = [...new Set(ids)];
    const count = await this.repository.count({
      where: { id: In(uniqueIds), userId },
    });
    if (count !== uniqueIds.length)
      throw new NotFoundException('部分内容不存在');
    await this.repository.softDelete({ id: In(uniqueIds), userId });
    return { ids: uniqueIds };
  }

  private fields(dto: CreateContentArticleDto) {
    return {
      title: dto.title.trim(),
      coverUrl: dto.coverUrl ?? '',
      idea: dto.idea ?? '',
      content: dto.content ?? '',
    };
  }

  private async preferences(
    dto: CreateContentArticleDto,
    current: ContentArticle | null,
    userId: number,
    canUseTemplates: boolean,
  ) {
    const fields: Pick<CreateContentArticleDto, 'aiConfigId' | 'templateId'> =
      {};
    if (dto.aiConfigId !== undefined) {
      if (dto.aiConfigId !== null && dto.aiConfigId !== current?.aiConfigId)
        await this.configs.findUsableContentCreationConfig(dto.aiConfigId);
      fields.aiConfigId = dto.aiConfigId;
    }
    if (dto.templateId !== undefined) {
      if (dto.templateId !== null && dto.templateId !== current?.templateId) {
        if (!canUseTemplates) throw new ForbiddenException('无权使用写作模板');
        await this.templates.findOne(dto.templateId, userId);
      }
      fields.templateId = dto.templateId;
    }
    return fields;
  }
}
