import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type VisualPromptTaskType = 'extract' | 'compose';
export type VisualPromptTaskStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'interrupted';
export type VisualPromptRequestedOutput = 'videoMotion' | 'cameraMotion';

export interface VisualPromptTaskSnapshot {
  templateVersion: number;
  idea?: string;
  targetModel?: string;
  requestedOutputs?: VisualPromptRequestedOutput[];
}

export interface VisualPromptTaskResult {
  templateId: number;
  templateVersion: number;
  targetModel?: string;
  positivePrompt?: string;
  negativePrompt?: string;
  videoMotion?: string;
  cameraMotion?: string;
  notes?: string;
  extractedAt?: string;
}

@Entity('visual_prompt_tasks')
@Index('UQ_visual_prompt_task_request', ['userId', 'requestId'], {
  unique: true,
})
@Index('UQ_visual_prompt_task_active', ['activeKey'], { unique: true })
@Index('IDX_visual_prompt_task_queue', ['status', 'id'])
export class VisualPromptTask extends BaseEntity {
  @Column({ type: 'int' }) userId: number;
  @Column({ type: 'varchar', length: 20 }) taskType: VisualPromptTaskType;
  @Column({ type: 'int' }) templateId: number;
  @Column({ type: 'int', nullable: true }) workflowId: number | null;
  @Column({ type: 'varchar', length: 80 }) requestId: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) activeKey:
    | string
    | null;
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: VisualPromptTaskStatus;
  @Column({ type: 'varchar', length: 120, default: '等待执行' }) stage: string;
  @Column({ type: 'json' }) snapshot: VisualPromptTaskSnapshot;
  @Column({ type: 'json', nullable: true })
  result: VisualPromptTaskResult | null;
  @Column({ type: 'varchar', length: 400, nullable: true }) errorMessage:
    | string
    | null;
  @Column({ type: 'varchar', length: 36, nullable: true }) workerId:
    | string
    | null;
  @Column({ type: 'datetime', nullable: true }) leaseExpiresAt: Date | null;
  @Column({ type: 'datetime', nullable: true }) startedAt: Date | null;
  @Column({ type: 'datetime', nullable: true }) finishedAt: Date | null;
}
