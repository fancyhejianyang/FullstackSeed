import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type {
  AgentMessageRole,
  AgentMessageType,
} from '../agent-apps.constants';

@Index('IDX_agent_messages_session', ['sessionId', 'id'])
@Index('UQ_agent_messages_client', ['sessionId', 'clientMessageId'], {
  unique: true,
})
@Entity('agent_messages')
export class AgentMessage extends BaseEntity {
  @Column({ type: 'int' })
  sessionId: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 16 })
  role: AgentMessageRole;

  @Column({ type: 'varchar', length: 32, default: 'text' })
  messageType: AgentMessageType;

  @Column({ type: 'longtext' })
  content: string;

  @Column({ type: 'simple-json', nullable: true })
  structuredData: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  executionId: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  clientMessageId: string | null;
}
