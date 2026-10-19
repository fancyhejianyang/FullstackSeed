import { Column, Entity, Index, VersionColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('content_articles')
@Index('IDX_content_articles_owner', ['userId', 'id'])
export class ContentArticle extends BaseEntity {
  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'varchar', length: 2048, default: '' })
  coverUrl: string;

  @Column({ type: 'mediumtext' })
  idea: string;

  @Column({ type: 'mediumtext' })
  content: string;

  @VersionColumn()
  version: number;
}
