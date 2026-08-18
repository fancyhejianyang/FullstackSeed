import { BadRequestException, Injectable } from '@nestjs/common';
import { PdfDocumentParser } from './parsers/pdf-document.parser';
import { TextDocumentParser } from './parsers/text-document.parser';
import { WordDocumentParser } from './parsers/word-document.parser';
import {
  type DocumentParseContext,
  type DocumentParser,
} from './types';

@Injectable()
export class DocumentParsersService {
  private readonly parsers: DocumentParser[];

  constructor(
    textParser: TextDocumentParser,
    pdfParser: PdfDocumentParser,
    wordParser: WordDocumentParser,
  ) {
    this.parsers = [textParser, pdfParser, wordParser];
  }

  async parse(context: DocumentParseContext) {
    const parser = this.parsers.find((item) => item.supports(context.contentType));
    if (!parser) {
      throw new BadRequestException('当前内容类型暂不支持手动解析');
    }
    return parser.parse(context);
  }
}
