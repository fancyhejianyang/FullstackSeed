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

  async parse(context: DocumentParseContext): Promise<string> {
    if (!context.file?.buffer.length) {
      throw new BadRequestException('Word 解析缺少文件内容');
    }
    if (!this.isDocx(context.file.fileName)) {
      throw new BadRequestException('手动 Word 解析目前支持 .docx；.doc 请使用 MinerU 解析');
    }
    const mammoth = this.loadMammoth();
    const result = await mammoth.extractRawText({ buffer: context.file.buffer });
    const text = this.normalizeText(result.value);
    if (!text) {
      throw new BadRequestException('Word 文档未提取到正文内容');
    }
    return text;
  }

  private isDocx(fileName?: string | null) {
    return (fileName || '').toLowerCase().endsWith('.docx');
  }

  private loadMammoth(): {
    extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }>;
  } {
    try {
      const requireFn = eval('require') as NodeRequire;
      return requireFn('mammoth') as {
        extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }>;
      };
    } catch {
      throw new BadRequestException('手动 Word 解析依赖 mammoth 未安装，请安装依赖后重试');
    }
  }

  private normalizeText(text?: string) {
    return (text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
