import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_routing_rule_knowledge_bases')
@Index(['ruleId', 'knowledgeBaseId'], { unique: true })
export class KnowledgeRoutingRuleKnowledgeBase extends BaseEntity {
  @Index()
  @Column({ type: 'int' })
  ruleId: number;

  @Index()
  @Column({ type: 'int' })
  knowledgeBaseId: number;
}
