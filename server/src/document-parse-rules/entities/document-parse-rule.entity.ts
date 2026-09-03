import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('document_parse_rules')
export class DocumentParseRule extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ type: 'int', default: 1 })
  textMaxSizeMb: number;

  @Column({ type: 'int', default: 5000 })
  textMaxLines: number;

  @Column({ type: 'int', default: 10 })
  pdfPagesPerPart: number;

  @Column({ type: 'int', default: 200 })
  wordParagraphsPerPart: number;

  @Column({ type: 'tinyint', default: true })
  preferSentenceBoundary: boolean;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;
}
