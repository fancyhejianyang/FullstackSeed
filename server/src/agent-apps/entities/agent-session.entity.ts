import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type {
  AgentExecutionStatus,
  AgentSessionStatus,
} from '../agent-apps.constants';

@Index('IDX_agent_sessions_owner_app', ['userId', 'agentAppId', 'id'])
@Entity('agent_sessions')
export class AgentSession extends BaseEntity {
  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 120 })
  userName: string;

  @Column({ type: 'int' })
  agentAppId: number;

  @Column({ type: 'varchar', length: 120 })
  agentAppName: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 24, default: 'active' })
  status: AgentSessionStatus;

  @Column({ type: 'int', default: 0 })
  messageCount: number;

  /** 复用现有知识问答链路的内部会话，仅服务端维护。 */
  @Column({ type: 'int', nullable: true })
  knowledgeSessionId: number | null;

  @Column({ type: 'text', nullable: true })
  lastMessage: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  lastExecutionStatus: AgentExecutionStatus | null;
}
