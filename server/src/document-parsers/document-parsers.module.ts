import { Module } from '@nestjs/common';
import { DocumentParsersService } from './document-parsers.service';
import { PdfDocumentParser } from './parsers/pdf-document.parser';
import { TextDocumentParser } from './parsers/text-document.parser';
import { WordDocumentParser } from './parsers/word-document.parser';

@Module({
  providers: [
    DocumentParsersService,
    TextDocumentParser,
    PdfDocumentParser,
    WordDocumentParser,
  ],
  exports: [DocumentParsersService],
})
export class DocumentParsersModule {}
