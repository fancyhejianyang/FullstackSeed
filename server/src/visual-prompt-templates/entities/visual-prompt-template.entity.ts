import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type VisualPromptMediaType = 'image' | 'video';

@Entity('visual_prompt_templates')
@Index('IDX_visual_prompt_template_owner', ['userId', 'mediaType', 'isEnabled'])
export class VisualPromptTemplate extends BaseEntity {
  @Column({ type: 'int' }) userId: number;
  @Column({ type: 'varchar', length: 120 }) name: string;
  @Column({ type: 'varchar', length: 12, default: 'image' })
  mediaType: VisualPromptMediaType;
  @Column({ type: 'varchar', length: 120, nullable: true })
  targetModel: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true })
  sourcePlatform: string | null;
  @Column({ type: 'int' }) aiConfigId: number;
  @Column({ type: 'varchar', length: 120 }) aiConfigName: string;
  @Column({ type: 'longtext' }) sourcePrompt: string;
  @Column({ type: 'longtext', nullable: true }) sourceNegativePrompt:
    | string
    | null;
  @Column({ type: 'longtext', nullable: true }) positiveTemplate: string | null;
  @Column({ type: 'longtext', nullable: true }) negativeTemplate: string | null;
  @Column({ type: 'text', nullable: true }) styleSummary: string | null;
  @Column({ type: 'text', nullable: true }) modelRules: string | null;
  @Column({ type: 'simple-json', nullable: true }) variables: string[] | null;
  @Column({ type: 'int', default: 1 }) version: number;
  @Column({ type: 'boolean', default: true }) isEnabled: boolean;
  @Column({ type: 'datetime', nullable: true }) extractedAt: Date | null;
}
