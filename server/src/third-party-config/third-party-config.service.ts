import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityTarget, type ObjectLiteral } from 'typeorm';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { KnowledgeAiProvider } from '../knowledge-ai-providers/entities/knowledge-ai-provider.entity';
import { MineruConfig } from '../mineru-configs/entities/mineru-config.entity';
import { VectorConfig } from '../vector-configs/entities/vector-config.entity';
import { StorageConfigService } from '../storage-config/storage-config.service';
import { THIRD_PARTY_MENUS } from '../menus/menu-structure';
import { ComfyConnection } from '../comfyui/entities/comfy-connection.entity';

export interface ThirdPartySummary {
  key: string;
  name: string;
  path: string;
  status: 'configured' | 'empty' | 'unsupported' | 'unavailable';
  total: number;
  enabled: number;
  updatedAt: string | null;
}

@Injectable()
export class ThirdPartyConfigService {
  private readonly logger = new Logger(ThirdPartyConfigService.name);
  constructor(
    private readonly db: DataSource,
    private readonly storage: StorageConfigService,
  ) {}

  async options(user: AuthUser) {
    const has = (code: string) =>
      user.isAdmin || user.permissions.includes(code);
    if (
      ![
        'Menu.read',
        'VectorConfig.read',
        'KnowledgeAiProvider.read',
        'MineruConfig.read',
      ].some(has)
    )
      throw new ForbiddenException('无权限读取服务选项');
    // 业务表单仅获得选项投影，不能因此读取完整第三方配置。
    const providers = [
      'Menu.read',
      'VectorConfig.read',
      'KnowledgeAiProvider.read',
    ].some(has)
      ? await this.db.getRepository(KnowledgeAiProvider).find({
          select: [
            'id',
            'name',
            'isEnabled',
            'models',
            'textModels',
            'visionModels',
            'imageGenerationModels',
            'embeddingModels',
          ],
          order: { id: 'DESC' },
        })
      : [];
    const mineruConfigs = ['Menu.read', 'MineruConfig.read'].some(has)
      ? await this.db
          .getRepository(MineruConfig)
          .find({ select: ['id', 'name', 'isEnabled'], order: { id: 'DESC' } })
      : [];
    return { providers, mineruConfigs };
  }

  async overview(user: AuthUser): Promise<ThirdPartySummary[]> {
    const result: ThirdPartySummary[] = [];
    for (const service of THIRD_PARTY_MENUS) {
      if (
        !user.isAdmin &&
        !user.permissions.includes(service.permission + '.read')
      )
        continue;
      const item: ThirdPartySummary = {
        key: service.key,
        name: service.name,
        path: '/third-party-config/' + service.key,
        status: 'empty',
        total: 0,
        enabled: 0,
        updatedAt: null,
      };
      try {
        if (service.key === 'wechat') item.status = 'unsupported';
        else if (service.key === 'storage') {
          const config = await this.storage.getConfig();
          item.total = config.updatedAt ? 1 : 0;
          item.enabled = Number(config.enabled);
          item.updatedAt = config.updatedAt || null;
          item.status = item.total ? 'configured' : 'empty';
        } else {
          const entities: Record<string, EntityTarget<ObjectLiteral>> = {
            ai: KnowledgeAiProvider,
            mineru: MineruConfig,
            vector: VectorConfig,
            comfyui: ComfyConnection,
          };
          // 只查询聚合元信息，密钥、地址及模型参数不进入概览响应。
          const row = await this.db
            .getRepository(entities[service.key])
            .createQueryBuilder('c')
            .select('COUNT(*)', 'total')
            .addSelect('SUM(c.isEnabled = 1)', 'enabled')
            .addSelect('MAX(c.updatedAt)', 'updatedAt')
            .getRawOne<{
              total: string;
              enabled: string;
              updatedAt: Date | string | null;
            }>();
          item.total = Number(row?.total ?? 0);
          item.enabled = Number(row?.enabled ?? 0);
          item.updatedAt = row?.updatedAt
            ? new Date(row.updatedAt).toISOString()
            : null;
          item.status = item.total ? 'configured' : 'empty';
        }
      } catch {
        this.logger.warn('第三方概览读取失败: ' + service.key);
        item.status = 'unavailable';
      }
      result.push(item);
    }
    return result;
  }
}
