import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { KnowledgeBaseCategory } from '../knowledge-bases/entities/knowledge-base-category.entity';
import { KnowledgeBase } from '../knowledge-bases/entities/knowledge-base.entity';
import {
  CreateKnowledgeRetrievalConfigDto,
  QueryKnowledgeRetrievalConfigDto,
  UpdateKnowledgeRetrievalConfigDto,
} from './dto/knowledge-retrieval-config.dto';
import { KnowledgeRetrievalConfig } from './entities/knowledge-retrieval-config.entity';

@Injectable()
export class KnowledgeRetrievalConfigsService {
  constructor(
    @InjectRepository(KnowledgeRetrievalConfig)
    private readonly configRepository: Repository<KnowledgeRetrievalConfig>,
    @InjectRepository(KnowledgeBase)
    private readonly knowledgeBaseRepository: Repository<KnowledgeBase>,
    @InjectRepository(KnowledgeBaseCategory)
    private readonly categoryRepository: Repository<KnowledgeBaseCategory>,
    private readonly aiFeatureConfigsService: AiFeatureConfigsService,
  ) {}

  async findAll(query: QueryKnowledgeRetrievalConfigDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();
    const baseWhere = {
      ...(query.retrievalMode ? { retrievalMode: query.retrievalMode } : {}),
    };
    const where = keyword
      ? [
          { ...baseWhere, name: Like(`%${keyword}%`) },
          { ...baseWhere, categoryNames: Like(`%${keyword}%`) },
          { ...baseWhere, knowledgeBaseNames: Like(`%${keyword}%`) },
          { ...baseWhere, rerankAiFeatureConfigName: Like(`%${keyword}%`) },
          { ...baseWhere, description: Like(`%${keyword}%`) },
        ]
      : baseWhere;
    const [list, total] = await this.configRepository.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total };
  }

  async findOne(id: number) {
    const config = await this.configRepository.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException('知识库检索配置不存在');
    }
    return config;
  }

  async findUsableConfig(id: number) {
    const config = await this.findOne(id);
    if (!config.isEnabled) {
      throw new BadRequestException('该知识库检索配置未启用');
    }
    return config;
  }

  async create(dto: CreateKnowledgeRetrievalConfigDto) {
    const entity = this.configRepository.create(await this.toEntityPayload(dto, true));
    this.assertRerankOptions(entity);
    return this.configRepository.save(entity);
  }

  async update(id: number, dto: UpdateKnowledgeRetrievalConfigDto) {
    const config = await this.findOne(id);
    Object.assign(config, await this.toEntityPayload(dto, false));
    this.assertRerankOptions(config);
    return this.configRepository.save(config);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.configRepository.softDelete(id);
    return { id };
  }

  async batchRemove(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return { ids: [] };
    const count = await this.configRepository.count({
      where: { id: In(uniqueIds) },
    });
    if (count !== uniqueIds.length) {
      throw new NotFoundException('部分知识库检索配置不存在');
    }
    await this.configRepository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }

  private async toEntityPayload(
    dto: CreateKnowledgeRetrievalConfigDto | UpdateKnowledgeRetrievalConfigDto,
    isCreate: boolean,
  ): Promise<Partial<KnowledgeRetrievalConfig>> {
    const payload: Partial<KnowledgeRetrievalConfig> = {};
    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.retrievalMode !== undefined || isCreate) {
      payload.retrievalMode = dto.retrievalMode ?? 'hybrid';
    }
    if (dto.categoryIds !== undefined) {
      const ids = this.normalizeIds(dto.categoryIds);
      const categories = ids.length
        ? await this.categoryRepository.find({ where: { id: In(ids) } })
        : [];
      if (categories.length !== ids.length) {
        throw new BadRequestException('部分知识库分类不存在');
      }
      payload.categoryIds = ids;
      payload.categoryNames =
        categories.map((item) => item.name).join('、') || null;
    } else if (isCreate) {
      payload.categoryIds = [];
      payload.categoryNames = null;
    }
    if (dto.knowledgeBaseIds !== undefined) {
      const ids = this.normalizeIds(dto.knowledgeBaseIds);
      const bases = ids.length
        ? await this.knowledgeBaseRepository.find({ where: { id: In(ids) } })
        : [];
      if (bases.length !== ids.length) {
        throw new BadRequestException('部分知识库不存在');
      }
      payload.knowledgeBaseIds = ids;
      payload.knowledgeBaseNames = bases.map((item) => item.name).join('、') || null;
    } else if (isCreate) {
      payload.knowledgeBaseIds = [];
      payload.knowledgeBaseNames = null;
    }
    if (dto.topK !== undefined || isCreate) payload.topK = dto.topK ?? 10;
    if (dto.minScore !== undefined || isCreate) payload.minScore = dto.minScore ?? 0;
    if (dto.rrfK !== undefined || isCreate) payload.rrfK = dto.rrfK ?? 60;
    if (dto.textWeight !== undefined || isCreate) payload.textWeight = dto.textWeight ?? 0.8;
    if (dto.vectorWeight !== undefined || isCreate) {
      payload.vectorWeight = dto.vectorWeight ?? 1;
    }
    if (dto.enableRerank !== undefined || isCreate) {
      payload.enableRerank = dto.enableRerank ?? false;
      if (!payload.enableRerank) {
        payload.rerankAiFeatureConfigId = null;
        payload.rerankAiFeatureConfigName = null;
      }
    }
    if (dto.rerankAiFeatureConfigId !== undefined) {
      if (dto.rerankAiFeatureConfigId) {
        const rerankConfig = await this.aiFeatureConfigsService.findOne(
          dto.rerankAiFeatureConfigId,
        );
        payload.rerankAiFeatureConfigId = rerankConfig.id;
        payload.rerankAiFeatureConfigName = rerankConfig.name;
      } else {
        payload.rerankAiFeatureConfigId = null;
        payload.rerankAiFeatureConfigName = null;
      }
    }
    if (dto.isEnabled !== undefined || isCreate) payload.isEnabled = dto.isEnabled ?? true;
    if (dto.description !== undefined) {
      payload.description = this.toNullableText(dto.description);
    }
    return payload;
  }

  private assertRerankOptions(config: Partial<KnowledgeRetrievalConfig>) {
    if (config.enableRerank && !config.rerankAiFeatureConfigId) {
      throw new BadRequestException('启用重排时请选择重排 AI 配置');
    }
  }

  private toNullableText(value?: string) {
    const text = value?.trim() ?? '';
    return text || null;
  }

  private normalizeIds(ids?: number[]) {
    return Array.from(new Set((ids ?? []).map(Number))).filter(Boolean);
  }
}
