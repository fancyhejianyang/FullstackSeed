import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import {
  CreateKnowledgeChunkConfigDto,
  QueryKnowledgeChunkConfigDto,
  UpdateKnowledgeChunkConfigDto,
} from './dto/knowledge-chunk-config.dto';
import { KnowledgeChunkConfig } from './entities/knowledge-chunk-config.entity';

@Injectable()
export class KnowledgeChunkConfigsService implements OnModuleInit {
  constructor(
    @InjectRepository(KnowledgeChunkConfig)
    private readonly configRepository: Repository<KnowledgeChunkConfig>,
  ) {}

  async onModuleInit() {
    const count = await this.configRepository.count();
    if (!count) {
      await this.configRepository.save(
        this.configRepository.create({
          name: '系统默认自动分片',
          chunkMode: 'auto',
          chunkSize: 1200,
          chunkOverlap: 120,
          timeoutMinutes: 5,
          pdfOcrMaxPages: 8,
          manualMaxChunks: 500,
          separator: 'length',
          preserveHeading: true,
          isDefault: true,
          isEnabled: true,
        }),
      );
    }
  }

  async findAll(query: QueryKnowledgeChunkConfigDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();
    const baseWhere = query.chunkMode ? { chunkMode: query.chunkMode } : {};
    const where = keyword
      ? { ...baseWhere, name: Like(`%${keyword}%`) }
      : baseWhere;
    const [list, total] = await this.configRepository.findAndCount({
      where,
      order: { isDefault: 'DESC', id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total };
  }

  async findOne(id: number) {
    const config = await this.configRepository.findOne({ where: { id } });
    if (!config) throw new NotFoundException('分片配置不存在');
    return config;
  }

  async findDefaultConfig() {
    const config =
      (await this.configRepository.findOne({
        where: { chunkMode: 'auto', isDefault: true, isEnabled: true },
        order: { id: 'DESC' },
      })) ??
      (await this.configRepository.findOne({
        where: { chunkMode: 'auto', isEnabled: true },
        order: { id: 'DESC' },
      }));
    if (!config) throw new BadRequestException('请先启用一个分片配置');
    return config;
  }

  async findDefaultManualConfig() {
    return (
      (await this.configRepository.findOne({
        where: { chunkMode: 'manual', isDefault: true, isEnabled: true },
        order: { id: 'DESC' },
      })) ??
      (await this.configRepository.findOne({
        where: { chunkMode: 'manual', isEnabled: true },
        order: { id: 'DESC' },
      })) ??
      (await this.findDefaultConfig())
    );
  }

  async create(dto: CreateKnowledgeChunkConfigDto) {
    this.assertChunkOptions(dto);
    const config = this.configRepository.create(this.toPayload(dto, true));
    const saved = await this.configRepository.save(config);
    if (saved.isDefault)
      await this.clearOtherDefault(saved.id, saved.chunkMode);
    return saved;
  }

  async update(id: number, dto: UpdateKnowledgeChunkConfigDto) {
    const config = await this.findOne(id);
    Object.assign(config, this.toPayload(dto, false));
    this.assertChunkOptions(config);
    const saved = await this.configRepository.save(config);
    if (saved.isDefault)
      await this.clearOtherDefault(saved.id, saved.chunkMode);
    return saved;
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.configRepository.softDelete(id);
    return { id };
  }

  async batchRemove(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return { ids: [] };
    await this.configRepository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }

  private toPayload(
    dto: CreateKnowledgeChunkConfigDto | UpdateKnowledgeChunkConfigDto,
    isCreate: boolean,
  ): Partial<KnowledgeChunkConfig> {
    const payload: Partial<KnowledgeChunkConfig> = {};
    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.chunkMode !== undefined || isCreate) {
      payload.chunkMode = dto.chunkMode ?? 'auto';
    }
    if (dto.chunkSize !== undefined || isCreate) {
      payload.chunkSize = dto.chunkSize ?? 1200;
    }
    if (dto.chunkOverlap !== undefined || isCreate) {
      payload.chunkOverlap = dto.chunkOverlap ?? 120;
    }
    if (dto.timeoutMinutes !== undefined || isCreate) {
      payload.timeoutMinutes = dto.timeoutMinutes ?? 5;
    }
    if (dto.pdfOcrMaxPages !== undefined || isCreate) {
      payload.pdfOcrMaxPages = dto.pdfOcrMaxPages ?? 8;
    }
    if (dto.manualMaxChunks !== undefined || isCreate) {
      payload.manualMaxChunks = dto.manualMaxChunks ?? 500;
    }
    if (dto.separator !== undefined || isCreate) {
      payload.separator = dto.separator ?? 'length';
    }
    if (dto.preserveHeading !== undefined || isCreate) {
      payload.preserveHeading = dto.preserveHeading ?? true;
    }
    if (dto.isDefault !== undefined || isCreate) {
      payload.isDefault = dto.isDefault ?? false;
    }
    if (dto.isEnabled !== undefined || isCreate) {
      payload.isEnabled = dto.isEnabled ?? true;
    }
    return payload;
  }

  private assertChunkOptions(config: Partial<KnowledgeChunkConfig>) {
    if (config.chunkMode === 'manual') return;
    const size = config.chunkSize ?? 1200;
    const overlap = config.chunkOverlap ?? 0;
    if (overlap >= size) {
      throw new BadRequestException('分片重叠必须小于分片大小');
    }
  }

  private async clearOtherDefault(
    id: number,
    chunkMode: KnowledgeChunkConfig['chunkMode'],
  ) {
    await this.configRepository
      .createQueryBuilder()
      .update(KnowledgeChunkConfig)
      .set({ isDefault: false })
      .where('id <> :id', { id })
      .andWhere('chunkMode = :chunkMode', { chunkMode })
      .execute();
  }
}
