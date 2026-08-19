import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import type { AiFeatureType } from './ai-feature-config.constants';
import {
  CreateAiFeatureConfigDto,
  QueryAiFeatureConfigDto,
  UpdateAiFeatureConfigDto,
} from './dto/ai-feature-config.dto';
import { AiFeatureConfig } from './entities/ai-feature-config.entity';

@Injectable()
export class AiFeatureConfigsService {
  constructor(
    @InjectRepository(AiFeatureConfig)
    private readonly configRepository: Repository<AiFeatureConfig>,
    private readonly providersService: KnowledgeAiProvidersService,
  ) {}

  async findAll(query: QueryAiFeatureConfigDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();
    const baseWhere = {
      ...(query.featureType ? { featureType: query.featureType } : {}),
      ...(query.providerId ? { providerId: query.providerId } : {}),
    };
    const where = keyword
      ? [
          { ...baseWhere, name: Like(`%${keyword}%`) },
          { ...baseWhere, providerName: Like(`%${keyword}%`) },
          { ...baseWhere, model: Like(`%${keyword}%`) },
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
      throw new NotFoundException('AI 功能配置不存在');
    }
    return config;
  }

  async findUsableChatConfig(id: number) {
    const config = await this.findOne(id);
    if (config.featureType !== 'chat') {
      throw new BadRequestException('请选择聊天类型的 AI 功能配置');
    }
    if (!config.isEnabled) {
      throw new BadRequestException('该 AI 聊天配置未启用');
    }
    return config;
  }

  findEnabledByFeature(featureType: AiFeatureType) {
    return this.configRepository.findOne({
      where: { featureType, isEnabled: true },
      order: { id: 'DESC' },
    });
  }

  async create(dto: CreateAiFeatureConfigDto) {
    const payload = await this.toEntityPayload(dto, true);
    const saved = await this.configRepository.save(
      this.configRepository.create(payload),
    );
    return saved;
  }

  async update(id: number, dto: UpdateAiFeatureConfigDto) {
    const config = await this.findOne(id);
    Object.assign(config, await this.toEntityPayload(dto, false));
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
      throw new NotFoundException('部分 AI 功能配置不存在');
    }
    await this.configRepository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }

  private async toEntityPayload(
    dto: CreateAiFeatureConfigDto | UpdateAiFeatureConfigDto,
    isCreate: boolean,
  ): Promise<Partial<AiFeatureConfig>> {
    const payload: Partial<AiFeatureConfig> = {};
    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.featureType !== undefined) payload.featureType = dto.featureType;
    if (dto.providerId !== undefined) {
      const provider = await this.providersService.findOne(dto.providerId);
      payload.providerId = provider.id;
      payload.providerName = provider.name;
    }
    if (dto.model !== undefined) payload.model = dto.model.trim();
    if (dto.systemPrompt !== undefined) {
      payload.systemPrompt = this.toNullableText(dto.systemPrompt);
    }
    if (dto.rules !== undefined) payload.rules = this.toNullableText(dto.rules);
    if (dto.responseFormat !== undefined || isCreate) {
      payload.responseFormat = dto.responseFormat ?? 'text';
    }
    if (dto.isEnabled !== undefined || isCreate) {
      payload.isEnabled = dto.isEnabled ?? true;
    }
    if (dto.description !== undefined) {
      payload.description = this.toNullableText(dto.description);
    }
    return payload;
  }

  private toNullableText(value?: string) {
    const text = value?.trim() ?? '';
    return text || null;
  }
}
