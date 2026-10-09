import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_ai_chat_sessions')
export class KnowledgeAiChatSession extends BaseEntity {
  @Index('IDX_chat_sessions_external_app')
  @Column({ type: 'int', nullable: true })
  externalAppId: number | null;

  /** 只保存随机会话凭证的摘要，默认查询和后台详情均不返回。 */
  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  sessionTokenHash: string | null;

  @Index('IDX_chat_sessions_service_status')
  @Column({ type: 'varchar', length: 24, default: 'ai' })
  serviceStatus: 'ai' | 'waiting_human' | 'human' | 'closed';

  @Column({ type: 'int', nullable: true })
  assignedAgentId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  assignedAgentName: string | null;

  /** 接待状态变更后，旧 AI 任务不得继续发布回答。 */
  @Column({ type: 'int', default: 0 })
  serviceVersion: number;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'int' })
  providerId: number;

  @Column({ length: 120 })
  providerName: string;

  @Column({ length: 120 })
  model: string;

  @Column({ type: 'int', default: 0 })
  messageCount: number;

  @Column({ type: 'text', nullable: true })
  lastQuestion: string | null;

  @Column({ type: 'text', nullable: true })
  lastAnswer: string | null;

  @Column({ type: 'text', nullable: true })
  hitKnowledgeBaseNames: string | null;

  @Column({ type: 'int', nullable: true })
  activeKnowledgeBaseId: number | null;

  @Column({ type: 'text', nullable: true })
  lastRetrievalQuery: string | null;

  @Column({ type: 'datetime', nullable: true })
  lastRetrievalAt: Date | null;

  @Column({ type: 'tinyint', default: true })
  isSuccess: boolean;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', default: 0 })
  elapsedMilliseconds: number;
}
