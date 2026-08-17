import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('mineru_configs')
export class MineruConfig extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ length: 500, default: 'https://mineru.net' })
  baseUrl: string;

  @Column({ type: 'text', nullable: true })
  token: string | null;

  @Column({ length: 20, default: 'Bearer' })
  authMode: string;

  @Column({ length: 50, default: 'vlm' })
  modelVersion: string;

  @Column({ length: 200, default: '/api/v4/extract/task' })
  createTaskPath: string;

  @Column({ length: 200, default: '/api/v4/extract/task/{task_id}' })
  queryTaskPath: string;

  @Column({ type: 'int', default: 5 })
  pollIntervalSeconds: number;

  @Column({ type: 'int', default: 30 })
  timeoutMinutes: number;

  @Column({ type: 'tinyint', default: true })
  isOcr: boolean;

  @Column({ type: 'tinyint', default: true })
  enableFormula: boolean;

  @Column({ type: 'tinyint', default: true })
  enableTable: boolean;

  @Column({ type: 'tinyint', default: false })
  isEnabled: boolean;
}
