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

const decimalTransformer = {
  to: (value?: number | null) => value ?? 0.88,
  from: (value: string | number | null) =>
    value === null ? 0.88 : Number(value),
};

@Entity('knowledge_standard_qas')
export class KnowledgeStandardQa extends BaseEntity {
  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'simple-json', nullable: true })
  aliases: string[] | null;

  @Column({ type: 'simple-json', nullable: true })
  keywords: string[] | null;

  @Column({ type: 'text' })
  answer: string;

  /**
   * 为空时代表全局标准问答；填写后只在同一检索配置的聊天应用中生效。
   */
  @Index()
  @Column({ type: 'int', nullable: true })
  retrievalConfigId: number | null;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    default: 0.88,
    transformer: decimalTransformer,
  })
  matchThreshold: number;

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

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
