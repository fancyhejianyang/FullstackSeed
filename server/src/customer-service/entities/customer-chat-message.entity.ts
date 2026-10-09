import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('customer_chat_messages')
@Index('UQ_customer_chat_messages_request', ['sessionId', 'clientMessageId'], {
  unique: true,
})
@Index('IDX_customer_chat_messages_session', ['sessionId', 'id'])
export class CustomerChatMessage extends BaseEntity {
  @Column({ type: 'int' })
  sessionId: number;

  @Column({ type: 'varchar', length: 16 })
  role: 'user' | 'ai' | 'agent' | 'system';

  @Column({ type: 'longtext' })
  content: string;

  @Column({ type: 'int', nullable: true })
  agentId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  agentName: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  clientMessageId: string | null;

  @Column({ type: 'int', nullable: true })
  taskId: number | null;
}
