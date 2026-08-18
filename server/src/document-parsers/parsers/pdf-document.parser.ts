import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type DocumentParseContentType,
  type DocumentParseContext,
  type DocumentParser,
} from '../types';

@Injectable()
export class PdfDocumentParser implements DocumentParser {
  supports(contentType: DocumentParseContentType) {
    return contentType === 'pdf';
  }

  parse(_context: DocumentParseContext): string {
    throw new BadRequestException(
      '手动 PDF 解析器尚未接入，请选择 MinerU 解析',
    );
  }
}
