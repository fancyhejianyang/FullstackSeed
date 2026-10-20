import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { ComfyOutputType } from './comfy-workflow.entity';

export type ComfyTaskStatus =
  | 'pending'
  | 'submitting'
  | 'queued'
  | 'running'
  | 'archiving'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'unknown';

@Entity('comfy_tasks')
@Index('UQ_comfy_task_request', ['userId', 'requestId'], { unique: true })
@Index('IDX_comfy_task_dispatch', ['status', 'id'])
export class ComfyTask extends BaseEntity {
  @Column({ type: 'int' }) userId: number;
  @Column({ type: 'int' }) workflowId: number;
  @Column({ type: 'int' }) workflowVersionId: number;
  @Column({ type: 'int' }) connectionId: number;
  @Column({ type: 'varchar', length: 80 }) requestId: string;
  @Column({ type: 'varchar', length: 20 }) outputType: ComfyOutputType;
  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status: ComfyTaskStatus;
  @Column({ type: 'varchar', length: 120, default: '等待执行' }) stage: string;
  @Column({ type: 'int', nullable: true }) progress: number | null;
  @Column({ type: 'simple-json', select: false })
  parameterSnapshot: Record<string, unknown>;
  @Column({ type: 'longtext', select: false }) workflowSnapshot: string;
  @Column({ type: 'simple-json', select: false }) bindingSnapshot: unknown[];
  @Column({ type: 'varchar', length: 120, nullable: true })
  promptId: string | null;
  @Column({ type: 'varchar', length: 700, nullable: true })
  errorMessage: string | null;
  @Column({ type: 'datetime', nullable: true }) startedAt: Date | null;
  @Column({ type: 'datetime', nullable: true }) finishedAt: Date | null;
}
