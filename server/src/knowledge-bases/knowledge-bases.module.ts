import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBaseCategory } from './entities/knowledge-base-category.entity';
import { KnowledgeBaseChunk } from './entities/knowledge-base-chunk.entity';
import { KnowledgeBaseDocument } from './entities/knowledge-base-document.entity';
import { KnowledgeBase } from './entities/knowledge-base.entity';
import { KnowledgeBasesController } from './knowledge-bases.controller';
import { KnowledgeBasesService } from './knowledge-bases.service';
import { KnowledgeTaskFileLogger } from './knowledge-task-file-logger.service';
import { DocumentParsersModule } from '../document-parsers/document-parsers.module';
import { DocumentOcrModule } from '../document-ocr/document-ocr.module';
import { MineruConfigsModule } from '../mineru-configs/mineru-configs.module';
import { TaskQueueModule } from '../task-queue/task-queue.module';
import { KnowledgeChunkConfigsModule } from '../knowledge-chunk-configs/knowledge-chunk-configs.module';
import { KnowledgeVectorsModule } from '../knowledge-vectors/knowledge-vectors.module';
import { LogRecordsModule } from '../log-records/log-records.module';
import { AiFeatureConfigsModule } from '../ai-feature-configs/ai-feature-configs.module';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { StoredFilesModule } from '../stored-files/stored-files.module';

@Module({
  imports: [
    DocumentParsersModule,
    DocumentOcrModule,
    MineruConfigsModule,
    TaskQueueModule,
    KnowledgeChunkConfigsModule,
    KnowledgeVectorsModule,
    LogRecordsModule,
    AiFeatureConfigsModule,
    KnowledgeAiProvidersModule,
    StoredFilesModule,
    TypeOrmModule.forFeature([
      KnowledgeBase,
      KnowledgeBaseCategory,
      KnowledgeBaseDocument,
      KnowledgeBaseChunk,
    ]),
  ],
  controllers: [KnowledgeBasesController],
  providers: [KnowledgeBasesService, KnowledgeTaskFileLogger],
})
export class KnowledgeBasesModule {}
