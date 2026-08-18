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

  parse(context: DocumentParseContext): string {
    if (!context.file?.buffer.length) {
      throw new BadRequestException('PDF 解析缺少文件内容');
    }
    throw new BadRequestException(
      '手动 PDF 解析器尚未接入，请选择 MinerU 解析',
    );
  }
}
