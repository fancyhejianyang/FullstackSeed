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
  @Column({ type: 'int', default: 0 })
  publishedVersion: number;
  @Column({ type: 'simple-json' })
  draft: WidgetConfig[];
  @Column({ type: 'simple-json' })
  published: WidgetConfig[];
  @Column({ type: 'simple-json', nullable: true })
  previous: WidgetConfig[] | null;
  @Column({ type: 'int', nullable: true })
  updatedBy: number | null;
  @Column({ type: 'datetime', nullable: true })
  publishedAt: Date | null;
}
