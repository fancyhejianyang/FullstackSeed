import { Column, Entity, Index, type ValueTransformer } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { WidgetConfig } from '../dashboard.types';

export const dashboardWidgetsTransformer: ValueTransformer = {
  to(value: WidgetConfig[] | null | undefined): string {
    return JSON.stringify(Array.isArray(value) ? value : []);
  },
  from(value: unknown): WidgetConfig[] | null {
    if (Array.isArray(value)) return value as WidgetConfig[];
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as WidgetConfig[]) : null;
    } catch {
      // 兼容旧库经 synchronize 新增 text 字段后留下的空串或损坏 JSON。
      // 返回 null 交由 registry 恢复默认板块，避免配置接口在反序列化阶段崩溃。
      return null;
    }
  },
};

@Entity('dashboard_configs')
export class DashboardConfig extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  key: string;
  @Column({ type: 'int', default: 0 })
  revision: number;
  @Column({ type: 'text', transformer: dashboardWidgetsTransformer })
  widgets: WidgetConfig[] | null;
  @Column({ type: 'int', nullable: true })
  updatedBy: number | null;
}
