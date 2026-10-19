import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { AiMaterialStyleKey } from '../ai-material.constants';

export type MaterialTaskStatus =
  | 'pending'
  | 'running'
  | 'storing'
  | 'succeeded'
  | 'failed'
  | 'interrupted'
  | 'unknown';

export interface MaterialGenerationSnapshot {
  requestVersion: number;
  revision: number;
  prompt: string;
  styleKey: AiMaterialStyleKey;
  styleVersion: number;
  customStyle: string | null;
  finalPrompt: string;
  config: {
    id: number;
    name: string;
    providerId: number;
    providerName: string;
    model: string;
  };
}

@Entity('material_generation_tasks')
@Index('UQ_material_task_request', ['userId', 'requestId'], { unique: true })
@Index('IDX_material_task_material', ['userId', 'materialId', 'id'])
@Index('IDX_material_task_queue', ['status', 'id'])
export class MaterialGenerationTask extends BaseEntity {
  @Column({ type: 'int' }) userId: number;
  @Column({ type: 'int' }) materialId: number;
  @Column({ type: 'int' }) materialVersion: number;
  @Column({ type: 'varchar', length: 36 }) requestId: string;
  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status: MaterialTaskStatus;
  @Index('UQ_material_task_active_material', { unique: true })
  @Column({ type: 'int', nullable: true })
  activeMaterialId: number | null;
  @Index('UQ_material_task_active_user', { unique: true })
  @Column({ type: 'int', nullable: true })
  activeUserId: number | null;
  @Column({ type: 'json' }) snapshot: MaterialGenerationSnapshot;
  @Column({ type: 'int', nullable: true }) resultFileId: number | null;
  @Column({ type: 'varchar', length: 36, nullable: true }) workerId:
    | string
    | null;
  @Column({ type: 'datetime', nullable: true }) leaseExpiresAt: Date | null;
  @Column({ type: 'datetime', nullable: true }) startedAt: Date | null;
  @Column({ type: 'datetime', nullable: true }) finishedAt: Date | null;
  @Column({ type: 'varchar', length: 500, nullable: true })
  errorMessage: string | null;
}
