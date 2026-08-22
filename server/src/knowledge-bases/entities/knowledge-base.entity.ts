import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_bases')
export class KnowledgeBase extends BaseEntity {
  @Index()
  @Column({ type: 'int', nullable: true })
  categoryId: number | null;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 80, default: '' })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  hitKeywords: string | null;

  @Column({ type: 'text', nullable: true })
  colloquialDescription: string | null;

  @Column({ type: 'int', default: 0 })
  matchPriority: number;

  @Column({ length: 20, default: 'text' })
  contentType: string;

  @Column({ type: 'longtext', nullable: true })
  contentText: string | null;

  @Column({ length: 255, default: '' })
  fileName: string;

  @Column({ length: 500, default: '' })
  fileUrl: string;

  @Column({ length: 30, default: 'uploaded' })
  processStage: string;

  @Column({ length: 30, default: 'pending' })
  parseStatus: string;

  @Column({ length: 30, default: 'pending' })
  chunkStatus: string;

  @Column({ length: 30, default: 'pending' })
  indexStatus: string;

  @Column({ type: 'text', nullable: true })
  lastProcessMessage: string | null;

  @Column({ type: 'tinyint', default: false })
  containsImages: boolean;

  @Column({ type: 'tinyint', default: false })
  allowFileUpload: boolean;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'int', default: 0 })
  sort: number;
}
