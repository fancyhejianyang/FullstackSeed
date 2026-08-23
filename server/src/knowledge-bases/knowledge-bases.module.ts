import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBaseCategory } from './entities/knowledge-base-category.entity';
import { KnowledgeBaseChunk } from './entities/knowledge-base-chunk.entity';
import { KnowledgeBaseDocument } from './entities/knowledge-base-document.entity';
import { KnowledgeBase } from './entities/knowledge-base.entity';
import { KnowledgeBasesController } from './knowledge-bases.controller';
import { KnowledgeBasesService } from './knowledge-bases.service';
import { DocumentParsersModule } from '../document-parsers/document-parsers.module';
import { MineruConfigsModule } from '../mineru-configs/mineru-configs.module';
import { TaskQueueModule } from '../task-queue/task-queue.module';
import { KnowledgeChunkConfigsModule } from '../knowledge-chunk-configs/knowledge-chunk-configs.module';
import { KnowledgeVectorsModule } from '../knowledge-vectors/knowledge-vectors.module';

@Module({
  imports: [
    DocumentParsersModule,
    MineruConfigsModule,
    TaskQueueModule,
    KnowledgeChunkConfigsModule,
    KnowledgeVectorsModule,
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
