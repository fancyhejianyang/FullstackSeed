import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBaseDocument } from '../knowledge-bases/entities/knowledge-base-document.entity';
import { KnowledgeBase } from '../knowledge-bases/entities/knowledge-base.entity';
import { KnowledgeRetrievalConfig } from '../knowledge-retrieval-configs/entities/knowledge-retrieval-config.entity';
import { KnowledgeRoutingRulesController } from './knowledge-routing-rules.controller';
import { KnowledgeRoutingRulesService } from './knowledge-routing-rules.service';
import { KnowledgeRoutingRuleDocument } from './entities/knowledge-routing-rule-document.entity';
import { KnowledgeRoutingRuleKnowledgeBase } from './entities/knowledge-routing-rule-knowledge-base.entity';
import { KnowledgeRoutingRule } from './entities/knowledge-routing-rule.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeRoutingRule,
      KnowledgeRoutingRuleKnowledgeBase,
      KnowledgeRoutingRuleDocument,
      KnowledgeRetrievalConfig,
      KnowledgeBase,
      KnowledgeBaseDocument,
    ]),
  ],
  controllers: [KnowledgeRoutingRulesController],
  providers: [KnowledgeRoutingRulesService],
  exports: [KnowledgeRoutingRulesService],
})
export class KnowledgeRoutingRulesModule {}
