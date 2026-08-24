import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import {
  CreateVectorConfigDto,
  QueryVectorConfigDto,
  UpdateVectorConfigDto,
} from './dto/vector-config.dto';
import { VectorConfig } from './entities/vector-config.entity';

export interface UsableVectorConfig {
  id: number;
  name: string;
  vectorDbType: string;
  chromaUrl: string;
  collectionName: string;
  tenant: string;
  database: string;
  providerId: number | null;
  providerName: string | null;
  model: string | null;
  embeddingDimension: number;
  token: string | null;
  source: 'database' | 'env';
}

@Injectable()
export class VectorConfigsService {
  constructor(
    @InjectRepository(VectorConfig)
    private readonly configRepository: Repository<VectorConfig>,
    private readonly providersService: KnowledgeAiProvidersService,
  ) {}

  async findAll(query: QueryVectorConfigDto) {
    const keyword = query.keyword?.trim();
    const current = await this.findCurrentEntity();
    if (!current) return { list: [], total: 0 };
    if (
      keyword &&
      ![
        current.name,
        current.providerName,
        current.model,
        current.chromaUrl,
        current.collectionName,
      ].some((item) => item?.toLowerCase().includes(keyword.toLowerCase()))
    ) {
      return { list: [], total: 0 };
    }
    return { list: [this.toView(current)], total: 1 };
  }

  async findOne(id: number) {
    return this.toView(await this.findEntity(id));
  }

  async findCurrent() {
    const config = await this.findCurrentEntity();
    return config ? this.toView(config) : null;
  }

  async saveCurrent(dto: CreateVectorConfigDto | UpdateVectorConfigDto) {
    const current = await this.findCurrentEntity();
    if (!current) {
      return this.create({
        ...dto,
        isEnabled: dto.isEnabled ?? true,
      } as CreateVectorConfigDto);
    }
    return this.update(current.id, dto);
  }

  async create(dto: CreateVectorConfigDto) {
    const payload = await this.toEntityPayload(dto, true);
    this.assertUsableVectorConfig(payload);
    const config = await this.configRepository.save(
      this.configRepository.create(payload),
    );
    await this.removeOtherConfigs(config.id);
    return this.toView(config);
  }

  async update(id: number, dto: UpdateVectorConfigDto) {
    const config = await this.findEntity(id);
    Object.assign(config, await this.toEntityPayload(dto, false));
    this.assertUsableVectorConfig(config);
    const saved = await this.configRepository.save(config);
    await this.removeOtherConfigs(saved.id);
    return this.toView(saved);
  }

  async remove(id: number) {
    await this.findEntity(id);
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
      throw new NotFoundException('部分向量化配置不存在');
    }
    await this.configRepository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }

  async findUsableConfig(): Promise<UsableVectorConfig> {
    const configs = await this.configRepository.find({
      where: { isEnabled: true },
      order: { id: 'DESC' },
      take: 2,
    });
    if (configs[0]) {
      if (configs.length > 1) {
        await this.removeOtherConfigs(configs[0].id);
      }
      return {
        id: configs[0].id,
        name: configs[0].name,
        vectorDbType: configs[0].vectorDbType,
        chromaUrl: configs[0].chromaUrl,
        collectionName: configs[0].collectionName,
        tenant: configs[0].tenant,
        database: configs[0].database,
        providerId: configs[0].providerId,
        providerName: configs[0].providerName,
        model: configs[0].model,
        embeddingDimension: this.resolveEmbeddingDimension(
          configs[0].embeddingDimension,
        ),
        token: configs[0].token,
        source: 'database',
      };
    }
    return {
      id: 0,
      name: '环境变量向量化配置',
      vectorDbType: 'chroma',
      chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
      collectionName: process.env.CHROMA_COLLECTION || 'knowledge_chunks',
      tenant: process.env.CHROMA_TENANT || 'default_tenant',
      database: process.env.CHROMA_DATABASE || 'default_database',
      providerId: null,
      providerName: null,
      model: null,
      embeddingDimension: this.resolveEmbeddingDimension(
        Number(process.env.EMBEDDING_DIMENSION || 768),
      ),
      token: process.env.CHROMA_TOKEN || null,
      source: 'env',
    };
  }

  private async findEntity(id: number) {
    const config = await this.configRepository.findOne({ where: { id } });
    if (!config) throw new NotFoundException('向量化配置不存在');
    return config;
  }

  private async findCurrentEntity() {
    return this.configRepository.findOne({
      where: {},
      order: { isEnabled: 'DESC', id: 'DESC' },
    });
  }

  private async toEntityPayload(
    dto: CreateVectorConfigDto | UpdateVectorConfigDto,
    isCreate: boolean,
  ) {
    const payload: Partial<VectorConfig> = {};
    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.vectorDbType !== undefined) payload.vectorDbType = dto.vectorDbType;
    if (dto.providerId !== undefined) {
      const provider = await this.providersService.findOne(dto.providerId);
      payload.providerId = provider.id;
      payload.providerName = provider.name;
    } else if (isCreate) {
      payload.providerId = null;
      payload.providerName = null;
    }
    if (dto.model !== undefined) {
      payload.model = dto.model.trim() || null;
    } else if (isCreate) {
      payload.model = null;
    }
    if (dto.embeddingDimension !== undefined) {
      payload.embeddingDimension = this.resolveEmbeddingDimension(
        dto.embeddingDimension,
      );
    } else if (isCreate) {
      payload.embeddingDimension = 768;
    }
    if (dto.chromaUrl !== undefined) payload.chromaUrl = dto.chromaUrl.trim();
    if (dto.collectionName !== undefined) {
      payload.collectionName = dto.collectionName.trim() || 'knowledge_chunks';
    } else if (isCreate) {
      payload.collectionName = 'knowledge_chunks';
    }
    if (dto.tenant !== undefined) {
      payload.tenant = dto.tenant.trim() || 'default_tenant';
    } else if (isCreate) {
      payload.tenant = 'default_tenant';
    }
    if (dto.database !== undefined) {
      payload.database = dto.database.trim() || 'default_database';
    } else if (isCreate) {
      payload.database = 'default_database';
    }
    if (dto.token !== undefined) payload.token = dto.token.trim() || null;
    if (dto.isEnabled !== undefined) payload.isEnabled = dto.isEnabled;
    if (isCreate && payload.vectorDbType === undefined) payload.vectorDbType = 'chroma';
    if (isCreate && payload.isEnabled === undefined) payload.isEnabled = false;
    return payload;
  }

  private async removeOtherConfigs(keepId: number) {
    await this.configRepository.softDelete({ id: Not(keepId) });
  }

  private assertUsableVectorConfig(config: Partial<VectorConfig>) {
    if (!config.isEnabled) return;
    if (!config.providerId || !config.model?.trim()) {
      throw new BadRequestException('启用向量化配置时，请选择大模型账号和向量模型');
    }
    if (this.isKnownUnsupportedTextEmbeddingModel(config.model)) {
      throw new BadRequestException(
        `当前知识库分片只支持文本向量模型，${config.model} 属于多模态/视觉向量模型，请改用 text-embedding-v4、text-embedding-v3 等文本向量模型`,
      );
    }
  }

  private isKnownUnsupportedTextEmbeddingModel(model: string) {
    const normalized = model.trim().toLowerCase();
    return [
      'vl-embedding',
      'vision',
      'image',
      'video',
      'multimodal',
      'multi-modal',
    ].some((keyword) => normalized.includes(keyword));
  }

  private toView(config: VectorConfig) {
    return {
      id: config.id,
      name: config.name,
      vectorDbType: config.vectorDbType,
      providerId: config.providerId,
      providerName: config.providerName,
      model: config.model,
      embeddingDimension: this.resolveEmbeddingDimension(
        config.embeddingDimension,
      ),
      chromaUrl: config.chromaUrl,
      collectionName: config.collectionName,
      tenant: config.tenant,
      database: config.database,
      tokenSet: !!config.token,
      isEnabled: !!config.isEnabled,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  private resolveEmbeddingDimension(value: unknown) {
    const dimension = Number(value);
    return Number.isFinite(dimension) && dimension > 0
      ? Math.trunc(dimension)
      : 768;
  }
}
