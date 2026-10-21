import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type {
  AgentPendingActionStatus,
  AgentToolKey,
} from '../agent-apps.constants';
import type { AgentBusinessForm } from '../agent-business.registry';

@Index('IDX_agent_pending_actions_session_status', ['sessionId', 'status'])
@Entity('agent_pending_actions')
export class AgentPendingAction extends BaseEntity {
  @Column({ type: 'int' })
  sessionId: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  agentAppId: number;

  @Column({ type: 'varchar', length: 64 })
  toolKey: AgentToolKey;

  @Column({ type: 'varchar', length: 32, default: 'collecting' })
  status: AgentPendingActionStatus;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'simple-json' })
  data: Record<string, unknown>;

  /** 响应时由代码目录生成，不落库，不能由请求覆盖。 */
  form?: AgentBusinessForm;

  @Column({ type: 'simple-json' })
  missingFields: string[];

  @Column({ type: 'simple-json' })
  validationErrors: string[];

  @Column({ type: 'int', nullable: true })
  submittedRecordId: number | null;

  @Column({ type: 'int', nullable: true })
  lastExecutionId: number | null;
}
