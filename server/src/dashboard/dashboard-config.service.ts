import {
  ConflictException,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DashboardConfig } from './entities/dashboard-config.entity';
import {
  DASHBOARD_WIDGETS,
  defaultWidgets,
  validateWidgets,
  resolveWidgets,
} from './dashboard.registry';
import { LogRecord } from '../log-records/entities/log-record.entity';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { DashboardConfiguration } from './dashboard.types';
import type { SaveDashboardDto } from './dto/dashboard.dto';

@Injectable()
export class DashboardConfigService {
  constructor(private readonly db: DataSource) {}
  async read(): Promise<DashboardConfiguration> {
    const row = await this.db
      .getRepository(DashboardConfig)
      .findOneBy({ key: 'home' });
    return {
      revision: row?.revision ?? 0,
      publishedVersion: row?.publishedVersion ?? 0,
      draft: resolveWidgets(row?.draft),
      published: resolveWidgets(row?.published),
      publishedAt: row?.publishedAt?.toISOString() ?? null,
      canRollback: !!row?.previous,
      definitions: DASHBOARD_WIDGETS,
    };
  }
  async change(
    dto: SaveDashboardDto | { revision: number },
    action: 'save' | 'publish' | 'rollback',
    user: AuthUser,
  ) {
    const widgets = 'widgets' in dto ? validateWidgets(dto.widgets) : null;
    await this.db.transaction(async (manager) => {
      const repo = manager.getRepository(DashboardConfig);
      await repo
        .createQueryBuilder()
        .insert()
        .values({
          key: 'home',
          revision: 0,
          publishedVersion: 0,
          draft: defaultWidgets(),
          published: defaultWidgets(),
        })
        .orIgnore()
        .execute();
      const row = await repo.findOneOrFail({
        where: { key: 'home' },
        lock: { mode: 'pessimistic_write' },
      });
      if (row.revision !== dto.revision)
        throw new ConflictException('配置已被其他管理员更新，请刷新后重试');
      if (action === 'rollback') {
        if (!row.previous) throw new BadRequestException('暂无可回退版本');
        const previous = validateWidgets(row.previous);
        row.previous = row.published;
        row.published = previous;
        row.draft = previous;
      } else {
        if (!widgets) throw new BadRequestException('缺少配置');
        row.draft = widgets;
        if (action === 'publish') {
          row.previous = row.published;
          row.published = widgets;
        }
      }
      row.revision += 1;
      row.updatedBy = user.userId;
      if (action !== 'save') {
        row.publishedVersion += 1;
        row.publishedAt = new Date();
      }
      await repo.save(row);
      await manager.getRepository(LogRecord).save({
        moduleId: 'dashboard',
        moduleName: '首页配置',
        action,
        recordId: String(row.id),
        operatorId: user.userId,
        operatorName: user.username,
        summary: {
          save: '保存首页草稿',
          publish: '发布首页配置',
          rollback: '回退首页配置',
        }[action],
        beforeData: { revision: dto.revision },
        afterData: {
          revision: row.revision,
          publishedVersion: row.publishedVersion,
          enabledWidgets: row.draft.filter((w) => w.enabled).length,
        },
        ip: '',
        userAgent: 'dashboard-config',
      });
    });
    return this.read();
  }
}
