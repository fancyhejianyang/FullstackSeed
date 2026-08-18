import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type DocumentParseContentType,
  type DocumentParseContext,
  type DocumentParser,
} from '../types';

@Injectable()
export class TextDocumentParser implements DocumentParser {
  supports(contentType: DocumentParseContentType) {
    return contentType === 'text';
  }

  parse(context: DocumentParseContext) {
    const content = context.contentText?.trim();
    if (!content) {
      throw new BadRequestException('文本知识库缺少文本内容');
    }
    return content;
  }
}
