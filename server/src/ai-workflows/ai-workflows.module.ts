import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeRetrievalConfig } from '../knowledge-retrieval-configs/entities/knowledge-retrieval-config.entity';
import { AiWorkflowsController } from './ai-workflows.controller';
import { AiWorkflowsService } from './ai-workflows.service';
import { AiWorkflow } from './entities/ai-workflow.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AiWorkflow, KnowledgeRetrievalConfig])],
  controllers: [AiWorkflowsController],
  providers: [AiWorkflowsService],
  exports: [AiWorkflowsService],
})
export class AiWorkflowsModule {}
