import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { ArticleStatus, ArticleCategory } from '../articles.constants';

@Entity('articles')
export class Article extends BaseEntity {
  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'varchar', length: 20, default: 'original' })
  category: ArticleCategory;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: ArticleStatus;
}
