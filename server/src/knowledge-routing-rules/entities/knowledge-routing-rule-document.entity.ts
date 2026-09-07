import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_routing_rule_documents')
@Index(['ruleId', 'documentId'], { unique: true })
export class KnowledgeRoutingRuleDocument extends BaseEntity {
  @Index()
  @Column({ type: 'int' })
  ruleId: number;

  @Index()
  @Column({ type: 'int' })
  documentId: number;
}
