import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type DocumentParseContentType,
  type DocumentParseContext,
  type DocumentParser,
} from '../types';

@Injectable()
export class WordDocumentParser implements DocumentParser {
  supports(contentType: DocumentParseContentType) {
    return contentType === 'word';
  }

  parse(_context: DocumentParseContext): string {
    throw new BadRequestException(
      '手动 Word 解析器尚未接入，请选择 MinerU 解析',
    );
  }
}
