import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type {
  AgentDraftStatus,
  AgentSkuDraftData,
  AgentToolKey,
} from '../agent-apps.constants';

@Index('IDX_agent_drafts_session_status', ['sessionId', 'status'])
@Entity('agent_drafts')
export class AgentDraft extends BaseEntity {
  @Column({ type: 'int' })
  sessionId: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  agentAppId: number;

  @Column({ type: 'varchar', length: 64 })
  toolKey: AgentToolKey;

  @Column({ type: 'varchar', length: 32, default: 'collecting' })
  status: AgentDraftStatus;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'simple-json' })
  data: AgentSkuDraftData;

  @Column({ type: 'simple-json' })
  missingFields: string[];

  @Column({ type: 'simple-json' })
  validationErrors: string[];

  @Column({ type: 'int', nullable: true })
  submittedRecordId: number | null;

  @Column({ type: 'int', nullable: true })
  lastExecutionId: number | null;
}
