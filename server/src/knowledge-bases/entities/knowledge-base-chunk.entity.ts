import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_base_chunks')
export class KnowledgeBaseChunk extends BaseEntity {
  @Index()
  @Column({ type: 'int' })
  knowledgeBaseId: number;

  @Index()
  @Column({ type: 'int', nullable: true })
  categoryId: number | null;

  @Index()
  @Column({ type: 'int' })
  documentId: number;

  @Column({ type: 'int', default: 0 })
  chunkIndex: number;

  @Column({ length: 200, default: '' })
  title: string;

  @Column({ type: 'longtext' })
  content: string;

  @Column({ type: 'longtext', nullable: true })
  coreContent: string | null;

  @Column({ type: 'int', nullable: true })
  manualStartOffset: number | null;

  @Column({ type: 'int', nullable: true })
  manualEndOffset: number | null;

  @Column({ type: 'int', default: 0 })
  contextBeforeLength: number;

  @Column({ type: 'int', default: 0 })
  contextAfterLength: number;

  @Column({ type: 'int', default: 0 })
  tokenCount: number;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Index()
  @Column({ type: 'varchar', length: 180, nullable: true })
  vectorId: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  contentHash: string | null;

  @Index()
  @Column({ length: 30, default: 'pending' })
  vectorStatus: string;

  @Column({ type: 'text', nullable: true })
  vectorError: string | null;

  @Column({ type: 'datetime', nullable: true })
  vectorizedAt: Date | null;
}
