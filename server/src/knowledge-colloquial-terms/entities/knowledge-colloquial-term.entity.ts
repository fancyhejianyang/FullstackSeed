import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export const KNOWLEDGE_COLLOQUIAL_SEMANTIC_TYPES = [
  'product-alias',
  'attribute',
  'business-term',
  'custom',
] as const;

export type KnowledgeColloquialSemanticType =
  (typeof KNOWLEDGE_COLLOQUIAL_SEMANTIC_TYPES)[number];

export const KNOWLEDGE_COLLOQUIAL_MATCH_MODES = ['contains', 'exact'] as const;

export type KnowledgeColloquialMatchMode =
  (typeof KNOWLEDGE_COLLOQUIAL_MATCH_MODES)[number];

@Entity('knowledge_colloquial_terms')
export class KnowledgeColloquialTerm extends BaseEntity {
  @Column({ length: 160 })
  term: string;

  /** 命中后替换到问题中的标准表达，可与其他词条组合形成标准问句。 */
  @Column({ length: 500 })
  replacement: string;

  @Column({ type: 'varchar', length: 32, default: 'custom' })
  semanticType: KnowledgeColloquialSemanticType;

  /** 人工维护的业务定性，会作为术语约束传给检索和回答模型。 */
  @Column({ type: 'text' })
  semanticDefinition: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  answerUnit: string | null;

  /** 为空时全局生效；填写后仅在对应检索配置中参与改写。 */
  @Index()
  @Column({ type: 'int', nullable: true })
  retrievalConfigId: number | null;

  @Column({ type: 'varchar', length: 20, default: 'contains' })
  matchMode: KnowledgeColloquialMatchMode;

  @Column({ type: 'simple-json', nullable: true })
  excludePhrases: string[] | null;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;
}
