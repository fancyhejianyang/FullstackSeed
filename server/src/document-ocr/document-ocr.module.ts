import { Module } from '@nestjs/common';
import { DocumentOcrService } from './document-ocr.service';

@Module({
  providers: [DocumentOcrService],
  exports: [DocumentOcrService],
})
export class DocumentOcrModule {}
