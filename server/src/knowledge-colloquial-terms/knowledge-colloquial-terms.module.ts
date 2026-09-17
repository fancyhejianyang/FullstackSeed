import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeColloquialTermsController } from './knowledge-colloquial-terms.controller';
import { KnowledgeColloquialTermsService } from './knowledge-colloquial-terms.service';
import { KnowledgeColloquialTerm } from './entities/knowledge-colloquial-term.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeColloquialTerm,
    ]),
  ],
  controllers: [KnowledgeColloquialTermsController],
  providers: [KnowledgeColloquialTermsService],
  exports: [KnowledgeColloquialTermsService],
})
export class KnowledgeColloquialTermsModule {}
