import { ConflictException, Injectable } from '@nestjs/common';
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
      widgets: resolveWidgets(row?.widgets),
      definitions: DASHBOARD_WIDGETS,
    };
  }
  async save(dto: SaveDashboardDto, user: AuthUser) {
    const widgets = validateWidgets(dto.widgets);
    await this.db.transaction(async (manager) => {
      const repo = manager.getRepository(DashboardConfig);
      await repo
        .createQueryBuilder()
        .insert()
        .values({
          key: 'home',
          revision: 0,
          widgets: defaultWidgets(),
        })
        .orIgnore()
        // 已存在时 INSERT IGNORE 不返回主键，禁止 TypeORM 再按新实体回填。
        // 下方按唯一 key 加锁读取真实记录，统一处理首次和后续保存。
        .updateEntity(false)
        .execute();
      const row = await repo.findOneOrFail({
        where: { key: 'home' },
        lock: { mode: 'pessimistic_write' },
      });
      if (row.revision !== dto.revision)
        throw new ConflictException('配置已被其他管理员更新，请刷新后重试');
      row.widgets = widgets;
      row.revision += 1;
      row.updatedBy = user.userId;
      await repo.save(row);
      await manager.getRepository(LogRecord).save({
        moduleId: 'dashboard',
        moduleName: '首页配置',
        action: 'save',
        recordId: String(row.id),
        operatorId: user.userId,
        operatorName: user.username,
        summary: '保存首页配置',
        beforeData: { revision: dto.revision },
        afterData: {
          revision: row.revision,
          enabledWidgets: row.widgets.filter((w) => w.enabled).length,
        },
        ip: '',
        userAgent: 'dashboard-config',
      });
    });
    return this.read();
  }
}
