import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type {
  AgentExecutionToolKey,
  AgentExecutionStatus,
} from '../agent-apps.constants';

@Index('UQ_agent_executions_request', ['requestId'], { unique: true })
@Index('IDX_agent_executions_owner_status', ['userId', 'agentAppId', 'status'])
@Index('IDX_agent_executions_status_lease', ['status', 'leaseExpiresAt'])
@Entity('agent_executions')
export class AgentExecution extends BaseEntity {
  @Column({ type: 'varchar', length: 120 })
  requestId: string;

  @Column({ type: 'int' })
  sessionId: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  agentAppId: number;

  @Column({ type: 'int', nullable: true })
  messageId: number | null;

  @Column({ type: 'int', nullable: true })
  pendingActionId: number | null;

  @Column({ type: 'varchar', length: 64 })
  toolKey: AgentExecutionToolKey;

  @Column({ type: 'varchar', length: 32, default: 'queued' })
  status: AgentExecutionStatus;

  @Column({ type: 'simple-json', nullable: true })
  parameterSummary: Record<string, unknown> | null;

  @Column({ type: 'simple-json', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ type: 'simple-json', nullable: true })
  configSnapshot: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  configVersion: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  statusReason: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  failureStage: string | null;

  @Column({ type: 'int', default: 0 })
  toolCallCount: number;

  @Column({ type: 'int', nullable: true })
  promptTokens: number | null;

  @Column({ type: 'int', nullable: true })
  completionTokens: number | null;

  @Column({ type: 'int', nullable: true })
  totalTokens: number | null;

  @Column({ type: 'int', nullable: true })
  modelCallDurationMs: number | null;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  heartbeatAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  finishedAt: Date | null;
}
