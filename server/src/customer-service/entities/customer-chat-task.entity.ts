import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type CustomerChatTaskStatus =
  | 'queued'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'expired';

@Entity('customer_chat_tasks')
@Index('IDX_customer_chat_tasks_app_status', ['externalAppId', 'status', 'id'])
@Index('IDX_customer_chat_tasks_session_status', ['sessionId', 'status'])
export class CustomerChatTask extends BaseEntity {
  @Column({ type: 'int' })
  externalAppId: number;

  @Column({ type: 'int' })
  sessionId: number;

  @Column({ type: 'int' })
  visitorMessageId: number;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'varchar', length: 24, default: 'queued' })
  status: CustomerChatTaskStatus;

  @Column({ type: 'int', default: 0 })
  sessionVersion: number;

  @Column({ type: 'longtext', nullable: true })
  answer: string | null;

  @Column({ type: 'int', nullable: true })
  aiMessageId: number | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cancelReason: string | null;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  finishedAt: Date | null;
}
