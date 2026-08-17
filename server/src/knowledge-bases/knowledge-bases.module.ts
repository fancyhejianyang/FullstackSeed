import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBaseCategory } from './entities/knowledge-base-category.entity';
import { KnowledgeBaseChunk } from './entities/knowledge-base-chunk.entity';
import { KnowledgeBaseDocument } from './entities/knowledge-base-document.entity';
import { KnowledgeBase } from './entities/knowledge-base.entity';
import { KnowledgeBasesController } from './knowledge-bases.controller';
import { KnowledgeBasesService } from './knowledge-bases.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeBase,
      KnowledgeBaseCategory,
      KnowledgeBaseDocument,
      KnowledgeBaseChunk,
    ]),
  ],
  controllers: [KnowledgeBasesController],
  providers: [KnowledgeBasesService],
})
export class KnowledgeBasesModule {}
