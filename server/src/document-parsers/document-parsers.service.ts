import { BadRequestException, Injectable } from '@nestjs/common';
import { StoredFilesService } from '../stored-files/stored-files.service';
import { PdfDocumentParser } from './parsers/pdf-document.parser';
import { ImageDocumentParser } from './parsers/image-document.parser';
import { TextDocumentParser } from './parsers/text-document.parser';
import { WordDocumentParser } from './parsers/word-document.parser';
import { type DocumentParseContext, type DocumentParser } from './types';

@Injectable()
export class DocumentParsersService {
  private readonly parsers: DocumentParser[];

  constructor(
    private readonly storedFilesService: StoredFilesService,
    textParser: TextDocumentParser,
    pdfParser: PdfDocumentParser,
    wordParser: WordDocumentParser,
    imageParser: ImageDocumentParser,
  ) {
    this.parsers = [textParser, pdfParser, wordParser, imageParser];
  }

  async parse(context: DocumentParseContext) {
    const parser = this.parsers.find((item) =>
      item.supports(context.contentType),
    );
    if (!parser) {
      throw new BadRequestException('当前内容类型暂不支持手动解析');
    }
    const preparedContext = await this.prepareFileContext(context);
    return parser.parse(preparedContext);
  }

  private async prepareFileContext(context: DocumentParseContext) {
    if (context.contentType === 'text' || !context.fileUrl || context.file) {
      return context;
    }
    const file = await this.storedFilesService.read(
      context.fileUrl,
      context.fileName,
    );
    return { ...context, file };
  }
}
