import { Module } from '@nestjs/common';
import { KnowledgeChunkConfigsModule } from '../knowledge-chunk-configs/knowledge-chunk-configs.module';
import { DocumentOcrService } from './document-ocr.service';

@Module({
  imports: [KnowledgeChunkConfigsModule],
  providers: [DocumentOcrService],
  exports: [DocumentOcrService],
})
export class DocumentOcrModule {}
