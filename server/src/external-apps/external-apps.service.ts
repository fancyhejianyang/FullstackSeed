import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { In, Like, Repository } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { KnowledgeRetrievalConfigsService } from '../knowledge-retrieval-configs/knowledge-retrieval-configs.service';
import {
  CreateExternalAppDto,
  QueryExternalAppDto,
  UpdateExternalAppDto,
} from './dto/external-app.dto';
import { ExternalApp } from './entities/external-app.entity';

@Injectable()
export class ExternalAppsService {
  constructor(
    @InjectRepository(ExternalApp)
    private readonly externalAppRepository: Repository<ExternalApp>,
    private readonly featureConfigsService: AiFeatureConfigsService,
    private readonly retrievalConfigsService: KnowledgeRetrievalConfigsService,
  ) {}

  async findAll(query: QueryExternalAppDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();
    const where = keyword
      ? [
          { name: Like(`%${keyword}%`) },
          { appId: Like(`%${keyword}%`) },
          { domain: Like(`%${keyword}%`) },
          { aiFeatureConfigName: Like(`%${keyword}%`) },
          { retrievalConfigName: Like(`%${keyword}%`) },
          { description: Like(`%${keyword}%`) },
        ]
      : {};
    const [list, total] = await this.externalAppRepository.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total };
  }

  async findOne(id: number) {
    const app = await this.externalAppRepository.findOne({ where: { id } });
    if (!app) {
      throw new NotFoundException('外部应用不存在');
    }
    return app;
  }

  async create(dto: CreateExternalAppDto) {
    const appId = dto.appId?.trim() || (await this.generateAppId());
    await this.assertAppIdUnique(appId);
    const config = dto.aiFeatureConfigId
      ? await this.featureConfigsService.findUsableChatConfig(
          dto.aiFeatureConfigId,
        )
      : null;
    const retrievalConfig = dto.retrievalConfigId
      ? await this.retrievalConfigsService.findUsableConfig(
          dto.retrievalConfigId,
        )
      : null;
    return this.externalAppRepository.save(
      this.externalAppRepository.create({
        name: dto.name.trim(),
        appId,
        domain: this.toNullableText(dto.domain),
        aiFeatureConfigId: config?.id ?? null,
        aiFeatureConfigName: config?.name ?? null,
        retrievalConfigId: retrievalConfig?.id ?? null,
        retrievalConfigName: retrievalConfig?.name ?? null,
        isEnabled: dto.isEnabled ?? true,
        description: this.toNullableText(dto.description),
      }),
    );
  }

  async update(id: number, dto: UpdateExternalAppDto) {
    const app = await this.findOne(id);
    if (dto.appId !== undefined) {
      const appId = dto.appId.trim();
      if (!appId) {
        throw new ConflictException('appId 不能为空');
      }
      if (appId !== app.appId) {
        await this.assertAppIdUnique(appId);
      }
      app.appId = appId;
    }
    if (dto.name !== undefined) app.name = dto.name.trim();
    if (dto.domain !== undefined) app.domain = this.toNullableText(dto.domain);
    if (dto.aiFeatureConfigId !== undefined) {
      const config = dto.aiFeatureConfigId
        ? await this.featureConfigsService.findUsableChatConfig(
            dto.aiFeatureConfigId,
          )
        : null;
      app.aiFeatureConfigId = config?.id ?? null;
      app.aiFeatureConfigName = config?.name ?? null;
    }
    if (dto.retrievalConfigId !== undefined) {
      const retrievalConfig = dto.retrievalConfigId
        ? await this.retrievalConfigsService.findUsableConfig(
            dto.retrievalConfigId,
          )
        : null;
      app.retrievalConfigId = retrievalConfig?.id ?? null;
      app.retrievalConfigName = retrievalConfig?.name ?? null;
    }
    if (dto.isEnabled !== undefined) app.isEnabled = dto.isEnabled;
    if (dto.description !== undefined) {
      app.description = this.toNullableText(dto.description);
    }
    return this.externalAppRepository.save(app);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.externalAppRepository.softDelete(id);
    return { id };
  }

  async batchRemove(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return { ids: [] };
    const count = await this.externalAppRepository.count({
      where: { id: In(uniqueIds) },
    });
    if (count !== uniqueIds.length) {
      throw new NotFoundException('部分外部应用不存在');
    }
    await this.externalAppRepository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }

  async assertUsableAppId(
    appId: string | undefined | null,
    requestDomain?: string | null,
  ) {
    const value = appId?.trim();
    if (!value) {
      throw new UnauthorizedException('缺少 appId');
    }
    const app = await this.externalAppRepository.findOne({
      where: { appId: value },
    });
    if (!app || !app.isEnabled) {
      throw new UnauthorizedException('appId 无效或已停用');
    }
    this.assertDomainAllowed(app, requestDomain);
    if (app.retrievalConfigId) {
      const retrievalConfig =
        await this.retrievalConfigsService.findUsableConfig(
          app.retrievalConfigId,
        );
      app.retrievalConfigName = retrievalConfig.name;
    }
    return app;
  }

  private async generateAppId() {
    for (let index = 0; index < 5; index += 1) {
      const appId = `app_${randomBytes(12).toString('hex')}`;
      const exists = await this.externalAppRepository.exists({
        where: { appId },
      });
      if (!exists) return appId;
    }
    throw new ConflictException('生成 appId 失败，请重试');
  }

  private async assertAppIdUnique(appId: string) {
    const exists = await this.externalAppRepository.exists({
      where: { appId },
    });
    if (exists) {
      throw new ConflictException('appId 已存在');
    }
  }

  private toNullableText(value?: string) {
    const text = value?.trim() ?? '';
    return text || null;
  }

  private assertDomainAllowed(app: ExternalApp, requestDomain?: string | null) {
    const domains = this.parseDomains(app.domain);
    if (!domains.length) return;
    const normalized = this.normalizeDomain(requestDomain);
    if (!normalized) {
      throw new UnauthorizedException('缺少来源域名');
    }
    if (!domains.includes(normalized)) {
      throw new UnauthorizedException('来源域名不在白名单');
    }
  }

  private parseDomains(domain: string | null) {
    return (domain || '')
      .split(/[\s,，]+/)
      .map((item) => this.normalizeDomain(item))
      .filter((item): item is string => !!item);
  }

  private normalizeDomain(value?: string | null) {
    const text = value?.trim().toLowerCase();
    if (!text) return '';
    try {
      return new URL(text.includes('://') ? text : `https://${text}`).hostname;
    } catch {
      return text.split('/')[0].split(':')[0];
    }
  }
}
