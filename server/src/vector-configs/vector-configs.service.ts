import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Not, Repository } from 'typeorm';
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
  token: string | null;
  source: 'database' | 'env';
}

@Injectable()
export class VectorConfigsService {
  constructor(
    @InjectRepository(VectorConfig)
    private readonly configRepository: Repository<VectorConfig>,
  ) {}

  async findAll(query: QueryVectorConfigDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();
    const where = keyword
      ? [
          { name: Like(`%${keyword}%`) },
          { chromaUrl: Like(`%${keyword}%`) },
          { collectionName: Like(`%${keyword}%`) },
        ]
      : {};
    const [list, total] = await this.configRepository.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list: list.map((item) => this.toView(item)), total };
  }

  async findOne(id: number) {
    return this.toView(await this.findEntity(id));
  }

  async create(dto: CreateVectorConfigDto) {
    if (dto.isEnabled) {
      await this.disableOtherConfigs();
    }
    const config = await this.configRepository.save(
      this.configRepository.create(this.toEntityPayload(dto, true)),
    );
    return this.toView(config);
  }

  async update(id: number, dto: UpdateVectorConfigDto) {
    const config = await this.findEntity(id);
    if (dto.isEnabled) {
      await this.disableOtherConfigs(id);
    }
    Object.assign(config, this.toEntityPayload(dto, false));
    const saved = await this.configRepository.save(config);
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
    });
    if (configs.length > 1) {
      throw new BadRequestException('当前存在多个已启用的向量化配置，请仅保留一个启用');
    }
    if (configs[0]) {
      return {
        id: configs[0].id,
        name: configs[0].name,
        vectorDbType: configs[0].vectorDbType,
        chromaUrl: configs[0].chromaUrl,
        collectionName: configs[0].collectionName,
        tenant: configs[0].tenant,
        database: configs[0].database,
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
      token: process.env.CHROMA_TOKEN || null,
      source: 'env',
    };
  }

  private async findEntity(id: number) {
    const config = await this.configRepository.findOne({ where: { id } });
    if (!config) throw new NotFoundException('向量化配置不存在');
    return config;
  }

  private toEntityPayload(
    dto: CreateVectorConfigDto | UpdateVectorConfigDto,
    isCreate: boolean,
  ) {
    const payload: Partial<VectorConfig> = {};
    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.vectorDbType !== undefined) payload.vectorDbType = dto.vectorDbType;
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

  private async disableOtherConfigs(excludeId?: number) {
    const where = excludeId ? { id: Not(excludeId), isEnabled: true } : { isEnabled: true };
    await this.configRepository.update(where, { isEnabled: false });
  }

  private toView(config: VectorConfig) {
    return {
      id: config.id,
      name: config.name,
      vectorDbType: config.vectorDbType,
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
}
