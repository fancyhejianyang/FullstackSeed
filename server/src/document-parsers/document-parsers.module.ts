import { Module } from '@nestjs/common';
import { StoredFilesModule } from '../stored-files/stored-files.module';
import { DocumentParsersService } from './document-parsers.service';
import { PdfDocumentParser } from './parsers/pdf-document.parser';
import { TextDocumentParser } from './parsers/text-document.parser';
import { WordDocumentParser } from './parsers/word-document.parser';

@Module({
  imports: [StoredFilesModule],
  providers: [
    DocumentParsersService,
    TextDocumentParser,
    PdfDocumentParser,
    WordDocumentParser,
  ],
  exports: [DocumentParsersService],
})
export class DocumentParsersModule {}
