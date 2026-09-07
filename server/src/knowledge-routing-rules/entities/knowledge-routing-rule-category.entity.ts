import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_routing_rule_categories')
@Index(['ruleId', 'categoryId'], { unique: true })
export class KnowledgeRoutingRuleCategory extends BaseEntity {
  @Index()
  @Column({ type: 'int' })
  ruleId: number;

  @Index()
  @Column({ type: 'int' })
  categoryId: number;
}
