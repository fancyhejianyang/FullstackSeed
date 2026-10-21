import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { WidgetConfig } from '../dashboard.types';

@Entity('dashboard_configs')
export class DashboardConfig extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  key: string;
  @Column({ type: 'int', default: 0 })
  revision: number;
  @Column({ type: 'simple-json' })
  widgets: WidgetConfig[];
  @Column({ type: 'int', nullable: true })
  updatedBy: number | null;
}
