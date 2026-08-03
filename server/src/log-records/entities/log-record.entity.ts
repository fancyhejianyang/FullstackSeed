import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('log_records')
export class LogRecord extends BaseEntity {
  @Column({ length: 80 })
  moduleId: string;

  @Column({ length: 100 })
  moduleName: string;

  @Column({ length: 40, default: '' })
  action: string;

  @Column({ length: 100, default: '' })
  recordId: string;

  @Column({ type: 'int', nullable: true })
  operatorId: number | null;

  @Column({ length: 100, default: '' })
  operatorName: string;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'simple-json', nullable: true })
  beforeData: Record<string, unknown> | null;

  @Column({ type: 'simple-json', nullable: true })
  afterData: Record<string, unknown> | null;

  @Column({ length: 80, default: '' })
  ip: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;
}
