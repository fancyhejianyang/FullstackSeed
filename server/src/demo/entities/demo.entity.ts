import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { DemoStatus, DemoCategory } from '../demo.constants';

@Entity('demo')
export class Demo extends BaseEntity {
  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'varchar', length: 20, default: 'original' })
  category: DemoCategory;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: DemoStatus;

  @Column({ type: 'tinyint', default: false })
  isFeatured: boolean;

  @Column({ type: 'simple-json', nullable: true })
  tags: string[] | null;

  @Column({ type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({ length: 255, default: '' })
  attachmentName: string;

  @Column({ type: 'text', nullable: true })
  attachmentUrl: string | null;
}
