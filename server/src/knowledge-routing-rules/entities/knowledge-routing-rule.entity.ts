import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export const KNOWLEDGE_ROUTING_RULE_TYPES = [
  'generic',
  'alias',
  'exclusive',
] as const;

export type KnowledgeRoutingRuleType =
  (typeof KNOWLEDGE_ROUTING_RULE_TYPES)[number];

export const KNOWLEDGE_ROUTING_MATCH_MODES = ['contains', 'exact'] as const;

export type KnowledgeRoutingMatchMode =
  (typeof KNOWLEDGE_ROUTING_MATCH_MODES)[number];

const decimalTransformer = {
  to: (value?: number | null) => value ?? 0,
  from: (value: string | number | null) => (value === null ? 0 : Number(value)),
};

@Entity('knowledge_routing_rules')
export class KnowledgeRoutingRule extends BaseEntity {
  @Column({ length: 160 })
  term: string;

  @Column({ type: 'varchar', length: 20, default: 'generic' })
  ruleType: KnowledgeRoutingRuleType;

  @Column({ type: 'varchar', length: 20, default: 'contains' })
  matchMode: KnowledgeRoutingMatchMode;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 4,
    default: -0.8,
    transformer: decimalTransformer,
  })
  weight: number;

  @Index()
  @Column({ type: 'int' })
  retrievalConfigId: number;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
