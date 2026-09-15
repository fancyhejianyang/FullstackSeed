import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export const KNOWLEDGE_STANDARD_QA_STATUSES = [
  'draft',
  'pending',
  'published',
  'disabled',
] as const;

export type KnowledgeStandardQaStatus =
  (typeof KNOWLEDGE_STANDARD_QA_STATUSES)[number];

@Entity('knowledge_standard_qas')
export class KnowledgeStandardQa extends BaseEntity {
  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'simple-json', nullable: true })
  aliases: string[] | null;

  @Column({ type: 'text' })
  answer: string;

  /**
   * 历史范围字段，仅保留数据库列；标准问答统一共享，不再读写或参与匹配。
   */
  @Index()
  @Column({ type: 'int', nullable: true })
  retrievalConfigId: number | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: KnowledgeStandardQaStatus;

  @Column({ type: 'datetime', nullable: true })
  effectiveAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'int', nullable: true })
  sourceChatMessageId: number | null;

  @Column({ type: 'simple-json', nullable: true })
  sourceChunkIds: number[] | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'datetime', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  hitCount: number;

  @Column({ type: 'datetime', nullable: true })
  lastHitAt: Date | null;

}
