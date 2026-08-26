import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type KnowledgeChunkSeparator = 'length' | 'paragraph';
export type KnowledgeChunkMode = 'auto' | 'manual';

@Entity('knowledge_chunk_configs')
export class KnowledgeChunkConfig extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 20, default: 'auto' })
  chunkMode: KnowledgeChunkMode;

  @Column({ type: 'int', default: 1200 })
  chunkSize: number;

  @Column({ type: 'int', default: 120 })
  chunkOverlap: number;

  @Column({ type: 'int', default: 5 })
  timeoutMinutes: number;

  @Column({ type: 'int', default: 8 })
  pdfOcrMaxPages: number;

  @Column({ type: 'int', default: 500 })
  manualMaxChunks: number;

  @Column({ type: 'varchar', length: 20, default: 'length' })
  separator: KnowledgeChunkSeparator;

  @Column({ type: 'tinyint', default: true })
  preserveHeading: boolean;

  @Column({ type: 'tinyint', default: false })
  isDefault: boolean;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
