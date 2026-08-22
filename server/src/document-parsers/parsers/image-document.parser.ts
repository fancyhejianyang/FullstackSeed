import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentOcrService } from '../../document-ocr/document-ocr.service';
import {
  type DocumentParseContentType,
  type DocumentParseContext,
  type DocumentParser,
} from '../types';

@Injectable()
export class ImageDocumentParser implements DocumentParser {
  constructor(private readonly documentOcrService: DocumentOcrService) {}

  supports(contentType: DocumentParseContentType) {
    return contentType === 'image';
  }

  async parse(context: DocumentParseContext): Promise<string> {
    if (!context.file?.buffer.length) {
      throw new BadRequestException('图片解析缺少文件内容');
    }
    const result = await this.documentOcrService.recognizeImage(context);
    return result.text.trim();
  }
}
